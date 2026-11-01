<?php

declare(strict_types=1);

/** Visit only image fields in a portfolio, keeping the rest of the saved settings intact. */
function map_portfolio_images(array $value, callable $map): array
{
    foreach (['logo', 'avatar'] as $key) {
        $value['profile'][$key] = $map($value['profile'][$key] ?? '');
    }
    $value['works'] = array_values(array_filter($value['works'], 'is_array'));
    foreach ($value['works'] as &$work) {
        $work['image'] = $map($work['image'] ?? '');
        $work['images'] = array_map($map, is_array($work['images'] ?? null) ? $work['images'] : []);
    }
    unset($work);

    return $value;
}

/** Whitelist the builder schema; image references never grant access to another creator's files. */
function published_portfolio_values(array $input, array $supabase, string $owner): array
{
    if (!is_array($input['profile'] ?? null) || !is_array($input['style'] ?? null) || !is_array($input['works'] ?? null) || !array_is_list($input['works'])) {
        invalid_input(['portfolio' => 'Send your complete portfolio.']);
    }
    $profile = [];
    foreach (['name' => 60, 'brand' => 40, 'role' => 100, 'intro' => 1000, 'bio' => 5000, 'slug' => 80, 'location' => 100, 'availability' => 100, 'email' => 254, 'website' => 500, 'instagram' => 500, 'github' => 500, 'linkedin' => 500, 'logo' => 4096, 'avatar' => 4096] as $key => $max) {
        $profile[$key] = trim(input_string($input['profile'], $key));
        if (mb_strlen($profile[$key]) > $max) invalid_input([$key => 'This field is too long.']);
    }
    if ($profile['name'] === '' || $profile['role'] === '' || preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/', $profile['slug']) !== 1) {
        invalid_input(['profile' => 'Add your name, role and a valid page name.']);
    }
    if ($profile['email'] !== '' && email_error($profile['email']) !== null) invalid_input(['email' => 'Enter a valid email address.']);
    foreach (['website', 'instagram', 'github', 'linkedin'] as $key) {
        if (https_url_error($profile[$key]) !== null) invalid_input([$key => 'Use a full HTTPS address.']);
    }
    $profile['skills'] = clean_tags($input['profile']['skills'] ?? []);
    if ($profile['skills'] === null) invalid_input(['skills' => 'Use up to 15 skills, each at most 40 characters.']);
    $style = $input['style'];
    if (!in_array($style['layout'] ?? null, PORTFOLIO_TEMPLATES, true)) invalid_input(['layout' => 'Choose a portfolio template.']);
    $style = [
        'layout' => $style['layout'],
        'accent' => is_string($style['accent'] ?? null) && preg_match('/^#[a-f0-9]{6}$/i', $style['accent']) === 1 ? strtolower($style['accent']) : '#006aff',
        'background' => ($style['background'] ?? '') === 'tint' ? 'tint' : 'white',
        'showLogo' => ($style['showLogo'] ?? true) !== false,
        'showAvatar' => ($style['showAvatar'] ?? true) !== false,
        'logoSize' => is_int($style['logoSize'] ?? null) && $style['logoSize'] >= 24 && $style['logoSize'] <= 120 ? $style['logoSize'] : 40,
    ];
    $works = [];
    foreach ($input['works'] as $work) {
        if (!is_array($work)) invalid_input(['works' => 'Check your included work.']);
        if (($work['visible'] ?? true) === false) continue;
        $clean = [];
        foreach (['id' => 100, 'title' => 200, 'description' => 10000, 'type' => 20, 'category' => 40, 'url' => 500, 'role' => 200, 'image' => 4096] as $key => $max) {
            $clean[$key] = trim(input_string($work, $key));
            if (mb_strlen($clean[$key]) > $max) invalid_input(['works' => 'A work field is too long.']);
        }
        if ($clean['id'] === '' || $clean['title'] === '' || https_url_error($clean['url']) !== null) invalid_input(['works' => 'Give each included work a title and valid link.']);
        if (!in_array($clean['type'], ['website', 'app', 'product', 'design', 'video', 'other'], true)) $clean['type'] = 'other';
        $clean['skills'] = clean_tags($work['skills'] ?? []);
        if ($clean['skills'] === null) invalid_input(['skills' => 'Use up to 15 skills per work, each at most 40 characters.']);
        $clean['visible'] = true;
        $clean['images'] = $work['images'] ?? [];
        if (!is_array($clean['images']) || !array_is_list($clean['images']) || count($clean['images']) > 10) invalid_input(['images' => 'Use up to ten photos per work.']);
        $works[] = $clean;
    }
    if ($works === []) invalid_input(['works' => 'Include at least one work.']);
    $paths = [];
    $content = map_portfolio_images(['version' => 1, 'profile' => $profile, 'style' => $style, 'works' => $works, 'publishedAt' => (int) (microtime(true) * 1000)], static function (mixed $image) use ($supabase, $owner, &$paths): string {
        if ($image === '') return '';
        if (!is_string($image) || strlen($image) > 4096) invalid_input(['image' => 'Choose a valid portfolio image.']);
        if (preg_match('#^/assets/(?:[a-z0-9_~-][a-z0-9._~-]*/)*[a-z0-9_~-][a-z0-9._~-]*\.(?:png|jpe?g|gif|webp|avif)$#i', $image) === 1) return $image;
        $base = rtrim($supabase['url'], '/') . '/storage/v1/object/';
        if (str_starts_with($image, $base . 'public/avatars/') && preg_match('~^[a-zA-Z0-9_/-]+\.(?:png|jpe?g|webp)$~', substr($image, strlen($base . 'public/avatars/'))) === 1) return $image;
        foreach (['portfolio-media', 'project-media'] as $bucket) {
            $prefix = $base . 'sign/' . $bucket . '/';
            if (!str_starts_with($image, $prefix)) continue;
            $path = explode('?', substr($image, strlen($prefix)), 2)[0];
            if (!str_starts_with($path, $owner . '/') || preg_match('~^[a-zA-Z0-9_/-]+\.(?:png|jpe?g|webp|gif|avif)$~', $path) !== 1) break;
            if ($bucket === 'portfolio-media') $paths[] = $path;
            return $bucket . ':' . $path;
        }
        invalid_input(['image' => 'Upload this image to your portfolio again.']);
    });
    $paths = array_values(array_unique($paths));
    if (count($paths) > 60 || strlen(json_encode($content, JSON_THROW_ON_ERROR)) > 240000) invalid_input(['portfolio' => 'Your portfolio is too large. Use fewer photos or shorter descriptions.']);

    return [$content, $paths];
}
