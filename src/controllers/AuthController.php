<?php

declare(strict_types=1);

// /api/auth/* handlers: validate input, apply rate limits, then call Supabase
// Auth with the publishable key. Supabase hashes and stores the passwords.

/**
 * @param array<string, mixed> $user a Supabase user
 * @return array{id: string, email: string, username: ?string, name: ?string}
 */
function public_user(array $user): array
{
    $meta = is_array($user['user_metadata'] ?? null) ? $user['user_metadata'] : [];

    return [
        'id' => (string) ($user['id'] ?? ''),
        'email' => (string) ($user['email'] ?? ''),
        'username' => isset($meta['username']) ? (string) $meta['username'] : null,
        'name' => isset($meta['full_name']) ? (string) $meta['full_name'] : null,
    ];
}

function is_session(mixed $body): bool
{
    return is_array($body) && is_string($body['access_token'] ?? null) && is_string($body['refresh_token'] ?? null);
}

/** @param array<string, mixed> $session */
function signed_in(array $session, bool $remember): never
{
    set_session_cookies($session, $remember, new_session_slot());
    json_response(['user' => public_user(is_array($session['user'] ?? null) ? $session['user'] : [])]);
}

function auth_failure(int $status, mixed $body): never
{
    if ($status === 0) {
        json_response(['error' => 'Showlio can’t reach the sign-in service right now. Try again in a moment.'], 503);
    }
    if ($status === 429) {
        json_response(['error' => 'Too many requests. Wait a minute and try again.'], 429);
    }
    error_log(sprintf('Supabase Auth answered %d (%s).', $status, supabase_error_code($body) ?: 'no code'));
    json_response(['error' => 'Something went wrong. Try again in a moment.'], 502);
}

/**
 * A fresh one-time code from Supabase's admin API (secret key). Supabase sends no email for
 * it, so its hourly email cap never applies; Showlio emails the code itself with PHPMailer.
 * type 'signup' also creates the account when it doesn't exist yet; 'recovery' resets a password.
 * @param array{url: string, publishable_key: string, secret_key: string} $supabase
 * @param array<string, mixed> $body
 * @return array{0: int, 1: mixed}
 */
function generate_code(array $supabase, array $body): array
{
    return supabase_request($supabase, 'POST', '/auth/v1/admin/generate_link', $body, secret: true);
}

/** The code and the account's details from a generate_code() answer, or null. */
function code_from(int $status, mixed $link): ?string
{
    return $status === 200 && is_array($link) && is_string($link['email_otp'] ?? null) ? $link['email_otp'] : null;
}

function code_email_failure(): never
{
    json_response(['error' => 'We couldn’t send the code email just now. Try again in a moment.'], 502);
}

function is_rejected_code(int $status): bool
{
    return in_array($status, [400, 401, 403, 404, 422], true);
}

/**
 * The signed-in user, refreshing an expired access token when a refresh cookie exists.
 * @param array{url: string, publishable_key: string, secret_key: string} $supabase
 * @return array{user: array<string, mixed>, access_token: string}|null null for guests
 */
function current_session(array $supabase): ?array
{
    $access = access_cookie();
    if ($access !== null) {
        [$status, $user] = auth_request($supabase, 'GET', '/auth/v1/user', null, $access);
        if ($status === 200 && is_array($user)) {
            return ['user' => $user, 'access_token' => $access];
        }
        if ($status !== 401 && $status !== 403) {
            auth_failure($status, $user); // Don't sign people out because Supabase blinked.
        }
    }

    $refresh = refresh_cookie();
    if ($refresh === null) {
        if ($access !== null) {
            clear_session_cookies();
        }
        return null;
    }

    [$status, $session] = auth_request($supabase, 'POST', '/auth/v1/token?grant_type=refresh_token', ['refresh_token' => $refresh[0]]);
    if ($status === 200 && is_session($session)) {
        set_session_cookies($session, $refresh[1]);
        return ['user' => is_array($session['user'] ?? null) ? $session['user'] : [], 'access_token' => $session['access_token']];
    }
    if ($status >= 400 && $status < 500 && $status !== 429) {
        clear_session_cookies();
        return null;
    }
    auth_failure($status, $session);
}

/** @param array{url: string, publishable_key: string, secret_key: string} $supabase */
function auth_session(array $supabase): never
{
    $session = current_session($supabase);
    if ($session === null) {
        json_response(['error' => 'Sign in to continue.'], 401);
    }
    json_response(['user' => public_user($session['user'])]);
}

/** @param array{url: string, publishable_key: string, secret_key: string} $supabase */
function auth_sign_in(array $supabase): never
{
    [$values, $errors] = validate_sign_in(read_json_body());
    if ($errors !== []) {
        invalid_input($errors);
    }
    $emailKey = attempt_key('sign-in', $values['email']);
    rate_limit($supabase, [attempt_key('sign-in', client_ip()) => 1000, $emailKey => 5], 900);

    [$status, $body] = auth_request($supabase, 'POST', '/auth/v1/token?grant_type=password', [
        'email' => $values['email'],
        'password' => $values['password'],
    ]);
    if ($status === 200 && is_session($body)) {
        rate_limit_clear($supabase, [$emailKey]);
        signed_in($body, $values['remember']);
    }

    match (supabase_error_code($body)) {
        'invalid_credentials' => json_response(['error' => 'Email or password is incorrect.', 'errors' => ['password' => 'Email or password is incorrect.']], 401),
        // Supabase only says this after the password matched, so it reveals nothing to a guesser.
        'email_not_confirmed' => json_response(['error' => 'Confirm your email first. Enter the code we sent you, or send a new one.', 'code' => 'email_not_confirmed'], 403),
        default => auth_failure($status, $body),
    };
}

/**
 * @param array{url: string, publishable_key: string, secret_key: string} $supabase
 * @param array{host: string, port: int, username: string, password: string, secure: string, from: string, from_name: string, site_url: string} $mail
 */
function auth_sign_up(array $supabase, array $mail): never
{
    [$values, $errors] = validate_sign_up(read_json_body());
    if ($errors !== []) {
        invalid_input($errors);
    }
    $limits = [attempt_key('sign-up', client_ip()) => 1000, attempt_key('sign-up', $values['email']) => 3];
    rate_limit($supabase, $limits, 3600);

    [$status, $available] = supabase_request($supabase, 'POST', '/rest/v1/rpc/username_available', ['candidate' => $values['username']]);
    if ($status === 200 && $available === false) {
        rate_limit_refund($supabase, array_keys($limits));
        invalid_input(['username' => 'That username is taken. Try another.']);
    }

    // Create first: generate_link silently ignores a new password for an existing
    // unconfirmed account. Never confirm a signup under somebody else's old password.
    $data = ['username' => $values['username'], 'full_name' => $values['name']];
    [$status, $body] = supabase_request($supabase, 'POST', '/auth/v1/admin/users', [
        'email' => $values['email'], 'password' => $values['password'],
        'email_confirm' => false, 'user_metadata' => $data,
    ], secret: true);
    $code = null;
    if ($status === 200 && is_array($body) && is_string($body['id'] ?? null)) {
        [$status, $body] = generate_code($supabase, ['type' => 'signup', 'email' => $values['email']]);
        $code = code_from($status, $body);
    }
    if ($code !== null && send_code_email($mail, 'confirmation', $values['email'], $code, $data)) {
        json_response(['verify' => true]);
    }
    rate_limit_refund($supabase, array_keys($limits)); // No email went out.
    if ($code !== null) {
        code_email_failure(); // Use Resend code, or reset the password, for this existing account.
    }

    match (supabase_error_code($body) ?: (string) ($body['code'] ?? '')) {
        'weak_password' => invalid_input(['password' => 'Choose a stronger password. Mix letters, numbers and symbols.']),
        'email_address_invalid', 'validation_failed' => invalid_input(['email' => 'Use a different email address.']),
        'user_already_exists', 'email_exists' => invalid_input(['email' => 'An account with this email already exists. Sign in or reset your password.']),
        default => auth_failure($status, $body),
    };
}

/** @param array{url: string, publishable_key: string, secret_key: string} $supabase */
function auth_verify(array $supabase): never
{
    [$values, $errors] = validate_code(read_json_body());
    if ($errors !== []) {
        invalid_input($errors);
    }
    $emailKey = attempt_key('verify', $values['email']);
    rate_limit($supabase, [attempt_key('verify', client_ip()) => 1000, $emailKey => 5], 900);

    [$status, $body] = auth_request($supabase, 'POST', '/auth/v1/verify', ['type' => 'email', 'email' => $values['email'], 'token' => $values['code']]);
    if ($status === 200 && is_session($body)) {
        rate_limit_clear($supabase, [$emailKey]);
        signed_in($body, true);
    }
    if (is_rejected_code($status)) {
        invalid_input(['code' => 'That code is wrong or has expired. Check your email or send a new code.']);
    }
    auth_failure($status, $body);
}

/**
 * @param array{url: string, publishable_key: string, secret_key: string} $supabase
 * @param array{host: string, port: int, username: string, password: string, secure: string, from: string, from_name: string, site_url: string} $mail
 */
function auth_resend(array $supabase, array $mail): never
{
    [$values, $errors] = validate_email_only(read_json_body());
    if ($errors !== []) {
        invalid_input($errors);
    }
    $limits = [attempt_key('resend', client_ip()) => 500, attempt_key('resend', $values['email']) => 5];
    rate_limit($supabase, $limits, 3600);

    [$status, $body] = generate_code($supabase, ['type' => 'signup', 'email' => $values['email']]);
    $code = code_from($status, $body);
    if ($code !== null && send_code_email($mail, 'confirmation', $values['email'], $code, is_array($body['user_metadata'] ?? null) ? $body['user_metadata'] : [])) {
        json_response(['sent' => true]);
    }
    rate_limit_refund($supabase, array_keys($limits)); // No email went out.
    if ($code !== null) {
        code_email_failure();
    }
    // Unknown and already-confirmed emails get the same answer, so this cannot find accounts.
    if (in_array($status, [400, 404, 422], true)) {
        json_response(['sent' => true]);
    }
    auth_failure($status, $body);
}

/**
 * @param array{url: string, publishable_key: string, secret_key: string} $supabase
 * @param array{host: string, port: int, username: string, password: string, secure: string, from: string, from_name: string, site_url: string} $mail
 */
function auth_forgot(array $supabase, array $mail): never
{
    [$values, $errors] = validate_email_only(read_json_body());
    if ($errors !== []) {
        invalid_input($errors);
    }
    $limits = [attempt_key('forgot', client_ip()) => 500, attempt_key('forgot', $values['email']) => 5];
    rate_limit($supabase, $limits, 3600);

    [$status, $body] = generate_code($supabase, ['type' => 'recovery', 'email' => $values['email']]);
    $code = code_from($status, $body);
    if ($code !== null && send_code_email($mail, 'recovery', $values['email'], $code, is_array($body['user_metadata'] ?? null) ? $body['user_metadata'] : [])) {
        json_response(['sent' => true]);
    }
    rate_limit_refund($supabase, array_keys($limits)); // No email went out.
    if ($code !== null) {
        code_email_failure();
    }
    // Unknown emails get the same answer as real ones, so this cannot find accounts.
    if ($status === 404) {
        json_response(['sent' => true]);
    }
    auth_failure($status, $body);
}

/** @param array{url: string, publishable_key: string, secret_key: string} $supabase */
function auth_reset(array $supabase): never
{
    [$values, $errors] = validate_reset(read_json_body());
    if ($errors !== []) {
        invalid_input($errors);
    }
    $emailKey = attempt_key('reset', $values['email']);
    rate_limit($supabase, [attempt_key('reset', client_ip()) => 500, $emailKey => 5], 900);

    [$status, $session] = auth_request($supabase, 'POST', '/auth/v1/verify', ['type' => 'recovery', 'email' => $values['email'], 'token' => $values['code']]);
    if ($status !== 200 || !is_session($session)) {
        if (is_rejected_code($status)) {
            invalid_input(['code' => 'That code is wrong or has expired. Send a new code and try again.']);
        }
        auth_failure($status, $session);
    }
    rate_limit_clear($supabase, [$emailKey]);

    [$status, $body] = auth_request($supabase, 'PUT', '/auth/v1/user', ['password' => $values['password']], $session['access_token']);
    // same_password means the chosen password already is the password, which is fine.
    if ($status === 200 || supabase_error_code($body) === 'same_password') {
        signed_in($session, true);
    }

    // The code is used up: end its session instead of leaving a half-finished reset signed in.
    auth_request($supabase, 'POST', '/auth/v1/logout?scope=local', null, $session['access_token']);
    if (supabase_error_code($body) === 'weak_password') {
        invalid_input(['password' => 'Choose a stronger password, then send a new code and try again.']);
    }
    auth_failure($status, $body);
}

/** @param array{url: string, publishable_key: string, secret_key: string} $supabase */
function auth_sign_out(array $supabase): never
{
    read_json_body();
    $access = access_cookie();
    if ($access !== null) {
        auth_request($supabase, 'POST', '/auth/v1/logout?scope=local', null, $access);
    }
    clear_session_cookies();
    json_response(['signedOut' => true]);
}
