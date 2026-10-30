<?php

declare(strict_types=1);

// /api/profile handlers for the signed-in creator. Each one is a single
// database call (my_profile, save_my_profile, set_my_preferences) made with the
// creator's own access token, so Row Level Security decides what may change.

const PREFERENCE_KEYS = ['showAvailability', 'communityDiscovery', 'projectNotifications', 'messageNotifications', 'communityNotifications', 'productNotifications'];

/**
 * Claims of the creator's access token, read without checking the signature. Only used to
 * decide when to refresh and to name the upload folder: Supabase verifies the token on
 * every call, and Storage only accepts uploads into the verified user's own folder.
 * @return array<string, mixed>
 */
function token_claims(string $token): array
{
    $payload = base64_decode(strtr(explode('.', $token)[1] ?? '', '-_', '+/'));
    $claims = is_string($payload) ? json_decode($payload, true) : null;

    return is_array($claims) ? $claims : [];
}

/**
 * A current access token, refreshed when it is missing or about to expire. Guests get 401.
 * @param array{url: string, publishable_key: string, secret_key: string} $supabase
 */
function user_token(array $supabase, bool $forceRefresh = false): string
{
    $token = $forceRefresh ? null : access_cookie();
    if ($token !== null && (int) (token_claims($token)['exp'] ?? 0) > time() + 30) {
        return $token;
    }

    $refresh = refresh_cookie();
    if ($refresh !== null) {
        [$status, $session] = auth_request($supabase, 'POST', '/auth/v1/token?grant_type=refresh_token', ['refresh_token' => $refresh[0]]);
        if ($status === 200 && is_session($session)) {
            set_session_cookies($session, $refresh[1]);
            return $session['access_token'];
        }
        if ($status === 0 || $status === 429 || $status >= 500) {
            auth_failure($status, $session); // Don't sign people out because Supabase blinked.
        }
    }
    clear_session_cookies();
    json_response(['error' => 'Sign in to continue.'], 401);
}

/**
 * The creator's token on pages guests can open too. Null for a guest, or when
 * the session can't be renewed: they then see what any guest sees.
 * @param array{url: string, publishable_key: string, secret_key: string} $supabase
 */
function optional_user_token(array $supabase): ?string
{
    $token = access_cookie();
    if ($token !== null && (int) (token_claims($token)['exp'] ?? 0) > time() + 30) {
        return $token;
    }
    $refresh = refresh_cookie();
    if ($refresh === null) {
        return null;
    }
    [$status, $session] = auth_request($supabase, 'POST', '/auth/v1/token?grant_type=refresh_token', ['refresh_token' => $refresh[0]]);
    if ($status !== 200 || !is_session($session)) {
        return null;
    }
    set_session_cookies($session, $refresh[1]);

    return $session['access_token'];
}

/**
 * Calls one of the workspace RPCs as the creator, retrying once with a refreshed token.
 * @param array{url: string, publishable_key: string, secret_key: string} $supabase
 * @param array<string, mixed> $args
 * @return array{0: int, 1: mixed}
 */
function creator_rpc(array $supabase, string $function, array $args = []): array
{
    $result = supabase_request($supabase, 'POST', '/rest/v1/rpc/' . $function, $args, user_token($supabase));
    if ($result[0] === 401) {
        $result = supabase_request($supabase, 'POST', '/rest/v1/rpc/' . $function, $args, user_token($supabase, true));
    }

    return $result;
}

/** Answers with the workspace account, or the matching error. */
function account_response(array $supabase, int $status, mixed $data): never
{
    if ($status === 200 && is_array($data)) {
        $profile = $data['profile'];
        $profile['avatar'] = avatar_url($supabase, $profile['avatarPath'] ?? null);
        unset($profile['avatarPath']);
        json_response(['profile' => $profile, 'preferences' => $data['preferences']]);
    }
    // my_profile() is null, or save_my_profile() raised P0002, when the account has no profile row.
    rpc_failure($status === 200 ? 404 : $status, $data, 'Your profile isn’t ready yet. Confirm your email, then sign in again.');
}

/**
 * Turns a failed workspace RPC into the right answer: rate limits, missing or
 * unavailable items, and limits the database enforces keep their own message.
 */
function rpc_failure(int $status, mixed $data, string $notFound): never
{
    $code = is_array($data) ? (string) ($data['code'] ?? '') : '';
    $message = is_array($data) && is_string($data['message'] ?? null) ? $data['message'] : '';
    if ($status === 429) {
        json_response(['error' => $message ?: 'Too many changes. Try again in a few minutes.'], 429);
    }
    if ($status === 404 || $code === 'P0002') {
        json_response(['error' => $notFound], 404);
    }
    if ($code === '42501') {
        // Row Level Security said no, e.g. liking a project that is no longer public.
        json_response(['error' => 'That isn’t available any more. Refresh and try again.'], 403);
    }
    if ($code === '23514' && str_starts_with($message, 'Limit reached')) {
        json_response(['error' => $message], 422);
    }
    auth_failure($status, $data);
}

/** @param array{url: string, publishable_key: string, secret_key: string} $supabase */
function avatar_url(array $supabase, ?string $path): string
{
    return $path ? rtrim($supabase['url'], '/') . '/storage/v1/object/public/avatars/' . str_replace('%2F', '/', rawurlencode($path)) : '';
}

/** @param array{url: string, publishable_key: string, secret_key: string} $supabase */
function profile_show(array $supabase): never
{
    [$status, $data] = creator_rpc($supabase, 'my_profile');
    account_response($supabase, $status, $data);
}

/** @param array{url: string, publishable_key: string, secret_key: string} $supabase */
function profile_save(array $supabase): never
{
    // Room for a photo: the workspace sends a 512px WebP, but allow up to 2 MB once base64-encoded.
    [$values, $errors] = validate_profile(read_json_body(3 * 1024 * 1024));
    if ($errors !== []) {
        invalid_input($errors);
    }
    $profile = array_diff_key($values, ['avatar' => true]);

    $uploaded = null;
    if ($values['avatar'] !== null) {
        $token = user_token($supabase);
        // A fresh random name each time, so browsers and CDNs never show a stale photo.
        $uploaded = (string) (token_claims($token)['sub'] ?? '') . '/' . bin2hex(random_bytes(12)) . '.' . $values['avatar']['extension'];
        [$status, $body] = supabase_request($supabase, 'POST', '/storage/v1/object/avatars/' . $uploaded, $values['avatar']['bytes'], $token, headers: ['Content-Type: ' . $values['avatar']['type']], timeout: 45);
        if ($status !== 200) {
            error_log('Avatar upload failed with status ' . $status . ': ' . json_encode($body));
            json_response(['error' => 'Couldn’t upload your photo. Try again or choose a different image.'], 502);
        }
        $profile['avatarPath'] = $uploaded;
    }

    [$status, $data] = creator_rpc($supabase, 'save_my_profile', ['profile' => $profile]);
    // Remove whichever photo is no longer used: the replaced one, or the new one if the save failed.
    $unused = $status === 200 ? ($data['previousAvatarPath'] ?? null) : $uploaded;
    if (is_string($unused) && $unused !== '') {
        supabase_request($supabase, 'DELETE', '/storage/v1/object/avatars/' . $unused, null, user_token($supabase));
    }
    account_response($supabase, $status, $data);
}

/** @param array{url: string, publishable_key: string, secret_key: string} $supabase */
function profile_preferences(array $supabase): never
{
    $changes = read_json_body();
    foreach ($changes as $key => $value) {
        if (!in_array($key, PREFERENCE_KEYS, true) || !is_bool($value)) {
            invalid_input([(string) $key => 'Unknown setting.']);
        }
    }
    if ($changes === []) {
        invalid_input(['preferences' => 'Choose a setting to change.']);
    }

    [$status, $data] = creator_rpc($supabase, 'set_my_preferences', ['changes' => $changes]);
    account_response($supabase, $status, $data);
}
