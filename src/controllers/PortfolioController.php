<?php

declare(strict_types=1);

/** Read the existing snapshot as the caller. No service key or cross-account writes. */
function published_portfolio_row(array $supabase, string $owner, ?string $token, bool $authorizedRead = false): ?array
{
    [$status, $rows] = supabase_request($supabase, 'GET', '/rest/v1/portfolio_drafts?owner_id=eq.' . rawurlencode($owner) . '&select=content&limit=1', null, $authorizedRead ? null : $token, secret: $authorizedRead);
    if ($status !== 200 || !is_array($rows)) rpc_failure($status, $rows, 'Your published portfolio could not be loaded.');
    if (!isset($rows[0])) return null;
    $envelope = is_array($rows[0]['content'] ?? null) ? $rows[0]['content'] : [];
    return ['content' => $envelope['published'] ?? null, 'media_paths' => $envelope['media_paths'] ?? [], 'envelope' => $envelope];
}

/** Uploads sign as their owner; public reads sign only an already-authorized snapshot's validated paths. */
function sign_portfolio_media(array $supabase, ?string $token, array $paths, bool $authorizedRead = false): array
{
    if ($paths === []) return [];
    [$status, $items] = supabase_request($supabase, 'POST', '/storage/v1/object/sign/portfolio-media', ['paths' => $paths, 'expiresIn' => 43200], $authorizedRead ? null : $token, secret: $authorizedRead);
    if ($status !== 200 || !is_array($items)) json_response(['error' => 'Your portfolio images could not be loaded. Try again.'], 502);
    $urls = [];
    foreach ($items as $item) {
        if (is_string($item['path'] ?? null) && is_string($item['signedURL'] ?? null)) $urls[$item['path']] = rtrim($supabase['url'], '/') . '/storage/v1' . $item['signedURL'];
    }
    return $urls;
}

function public_portfolio_snapshot(array $supabase, string $owner, ?string $token, array $projectUrls): ?array
{
    // Called only after creator_portfolio resolved this exact owner through the caller's RLS.
    // Keep sensitive snapshot content private in Storage/REST, even if the creator later hides their profile.
    [$status, $index] = supabase_request($supabase, 'GET', '/rest/v1/published_portfolios?owner_id=eq.' . rawurlencode($owner) . '&select=hidden_at&limit=1', secret: true);
    if ($status !== 200 || !is_array($index)) rpc_failure($status, $index, 'Your portfolio could not be loaded.');
    if (!isset($index[0])) return null;
    if (($index[0]['hidden_at'] ?? null) !== null) json_response(['error' => 'This portfolio is not available.'], 404);
    $row = published_portfolio_row($supabase, $owner, $token, true);
    $content = $row['content'] ?? null;
    if (!is_array($content) || !is_array($content['profile'] ?? null) || !is_array($content['works'] ?? null)) return null;
    // Owners can write arbitrary JSON to their draft directly. Never trust paths before a privileged sign.
    $paths = $row['media_paths'] ?? [];
    if (!is_array($paths) || count($paths) > 60) json_response(['error' => 'Your portfolio images need to be published again.'], 422);
    $paths = array_values(array_filter($paths, static fn (mixed $path): bool => is_string($path) && str_starts_with($path, $owner . '/') && preg_match('~^[a-zA-Z0-9_-]+/[a-zA-Z0-9_-]+\.(?:png|jpe?g|webp|gif|avif)$~', $path) === 1));
    $urls = sign_portfolio_media($supabase, $token, $paths, true);
    return map_portfolio_images($content, static function (mixed $image) use ($urls, $projectUrls): string {
        if (!is_string($image)) return '';
        if (str_starts_with($image, 'portfolio-media:')) return $urls[substr($image, 16)] ?? '';
        if (str_starts_with($image, 'project-media:')) return $projectUrls[substr($image, 14)] ?? '';
        return $image;
    });
}

/** Caller-only writes; the public row contains routing/moderation metadata, never contact text or image paths. */
function write_portfolio_snapshot(array $supabase, string $owner, string $token, array $content, array $paths, ?array $existing): void
{
    [$status, $rows] = supabase_request($supabase, 'GET', '/rest/v1/published_portfolios?owner_id=eq.' . rawurlencode($owner) . '&select=hidden_at&limit=1', null, $token);
    if ($status !== 200 || !is_array($rows)) rpc_failure($status, $rows, 'Your portfolio could not be published.');
    if (($rows[0]['hidden_at'] ?? null) !== null) json_response(['error' => 'This portfolio is unavailable. Contact Showlio before publishing it again.'], 403);
    $body = ['slug' => $content['profile']['slug'], 'content' => ['version' => 1], 'media_paths' => []];
    [$status, $data] = supabase_request($supabase, $rows !== [] ? 'PATCH' : 'POST', '/rest/v1/published_portfolios' . ($rows !== [] ? '?owner_id=eq.' . rawurlencode($owner) : ''), $body, $token);
    if ($status === 409) invalid_input(['slug' => 'That page name is already taken. Choose another one.']);
    if (!in_array($status, [200, 201, 204], true)) rpc_failure($status, $data, 'Your portfolio could not be published.');
    $envelope = $existing['envelope'] ?? [];
    $envelope['published'] = $content;
    $envelope['media_paths'] = $paths;
    [$status, $data] = supabase_request($supabase, $existing ? 'PATCH' : 'POST', '/rest/v1/portfolio_drafts' . ($existing ? '?owner_id=eq.' . rawurlencode($owner) : ''), ['content' => $envelope], $token);
    if (!in_array($status, [200, 201, 204], true)) rpc_failure($status, $data, 'Your portfolio could not be published.');
}

/** An image is a separate request, keeping large portfolios below request-size limits. */
function portfolio_media_add(array $supabase): never
{
    $token = user_token($supabase);
    [$image, $error] = image_upload(read_json_body(3 * 1024 * 1024)['image'] ?? null);
    if ($error !== null || $image === null) invalid_input(['image' => $error ?? 'Choose a portfolio image.']);
    $path = (string) (token_claims($token)['sub'] ?? '') . '/' . bin2hex(random_bytes(12)) . '.' . $image['extension'];
    [$status, $body] = supabase_request($supabase, 'POST', '/storage/v1/object/portfolio-media/' . $path, $image['bytes'], $token, headers: ['Content-Type: ' . $image['type']], timeout: 45);
    if ($status !== 200) json_response(['error' => 'Your image could not be uploaded. Try again.'], 502);
    $urls = sign_portfolio_media($supabase, $token, [$path]);
    if (!isset($urls[$path])) json_response(['error' => 'Your uploaded image could not be opened. Try again.'], 502);
    json_response(['image' => $urls[$path]]);
}

/** Publish the complete builder snapshot using existing owner-only table grants. */
function portfolio_publish(array $supabase): never
{
    $token = user_token($supabase);
    $owner = (string) (token_claims($token)['sub'] ?? '');
    [$content, $paths] = published_portfolio_values(read_json_body(262144), $supabase, $owner);
    $existing = published_portfolio_row($supabase, $owner, $token);
    write_portfolio_snapshot($supabase, $owner, $token, $content, $paths, $existing);
    // The editor stamps its draft with this, so it can tell later whether the draft is the published version.
    json_response(['published' => true, 'publishedAt' => $content['publishedAt']]);
}
