<?php

declare(strict_types=1);

// Supabase tokens live in HttpOnly cookies, so page scripts (or an injected
// script) can never read them. SameSite=Lax plus JSON-only POST routes keep
// other sites from using them.
//
// Several accounts can be signed in at once, one per browser tab. Every sign-in
// gets its own random session id, and its cookies carry that id in their name.
// A tab remembers its id (sessionStorage) and names it in the X-Showlio-Slot
// header, so:
//   - signing in in one tab never changes another tab's account,
//   - signing out ends that one session; tabs that used it go back to sign-in,
//     and ids are never reused, so they can't silently become someone else.
const ACCESS_COOKIE = 'showlio_access';
const REFRESH_COOKIE = 'showlio_refresh';
const MAIN_SESSION = 'main'; // The unsuffixed cookies from before multi-account sign-in.
const MAX_SESSIONS = 4;

function request_is_https(): bool
{
    return ($_SERVER['HTTPS'] ?? '') === 'on' || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';
}

function is_session_id(mixed $id): bool
{
    return is_string($id) && ($id === MAIN_SESSION || preg_match('/^[a-z0-9]{8}$/', $id) === 1);
}

function slot_cookie(string $name, string $id): string
{
    return $id === MAIN_SESSION ? $name : $name . '_' . $id;
}

/** Ids of the sessions this browser holds, in cookie order. */
function signed_in_slots(): array
{
    $ids = [];
    foreach (array_keys($_COOKIE) as $name) {
        if (preg_match('/^showlio_(?:access|refresh)(?:_([a-z0-9]{8}))?$/', (string) $name, $match) === 1) {
            $ids[$match[1] ?? MAIN_SESSION] = true;
        }
    }

    return array_keys($ids);
}

function slot_signed_in(string $id): bool
{
    return in_array($id, signed_in_slots(), true);
}

/** The session id this tab asked for in X-Showlio-Slot, if any. */
function requested_slot(): ?string
{
    $id = $_SERVER['HTTP_X_SHOWLIO_SLOT'] ?? null;

    return is_session_id($id) ? $id : null;
}

/**
 * The session a request acts as: the tab's own, even when it has ended (the tab then signs in
 * again rather than switching to another account), or else the first one this browser holds.
 */
function session_slot(): string
{
    return requested_slot() ?? signed_in_slots()[0] ?? MAIN_SESSION;
}

/** A fresh id for a new sign-in. Past the limit, the oldest-listed other sessions are signed out. */
function new_session_slot(): string
{
    $others = signed_in_slots();
    foreach (array_slice($others, 0, max(0, count($others) - (MAX_SESSIONS - 1))) as $id) {
        clear_session_cookies($id);
    }

    return bin2hex(random_bytes(4));
}

/** @param array<string, mixed> $session a Supabase token response */
function set_session_cookies(array $session, bool $remember, ?string $id = null): void
{
    $id ??= session_slot();
    $options = ['secure' => request_is_https(), 'httponly' => true, 'samesite' => 'Lax'];
    setcookie(slot_cookie(ACCESS_COOKIE, $id), (string) $session['access_token'], $options + [
        'path' => '/api',
        'expires' => $remember ? time() + (int) ($session['expires_in'] ?? 3600) : 0,
    ]);
    // The "p." (persistent) or "s." (session) prefix keeps the remember-me choice through refreshes.
    setcookie(slot_cookie(REFRESH_COOKIE, $id), ($remember ? 'p.' : 's.') . $session['refresh_token'], $options + [
        'path' => '/api',
        'expires' => $remember ? time() + 30 * 86400 : 0,
    ]);
    header('X-Showlio-Slot: ' . $id); // The tab keeps this, so its next requests use the same account.
}

function clear_session_cookies(?string $id = null): void
{
    $id ??= session_slot();
    $options = ['expires' => 1, 'secure' => request_is_https(), 'httponly' => true, 'samesite' => 'Lax'];
    setcookie(slot_cookie(ACCESS_COOKIE, $id), '', $options + ['path' => '/api']);
    setcookie(slot_cookie(REFRESH_COOKIE, $id), '', $options + ['path' => '/api']);
    if ($id === MAIN_SESSION) {
        setcookie(REFRESH_COOKIE, '', $options + ['path' => '/api/auth']); // Where earlier versions kept it.
    }
}

/** A cookie value safe to put in an HTTP header, or null. Cookies arrive URL-decoded, so CR/LF is possible. */
function session_token(?string $value): ?string
{
    return $value !== null && preg_match('#^[A-Za-z0-9._~+/=-]{1,4096}$#', $value) === 1 ? $value : null;
}

function access_cookie(): ?string
{
    return session_token($_COOKIE[slot_cookie(ACCESS_COOKIE, session_slot())] ?? null);
}

/** @return array{0: string, 1: bool}|null refresh token and whether the session is remembered */
function refresh_cookie(): ?array
{
    $value = (string) ($_COOKIE[slot_cookie(REFRESH_COOKIE, session_slot())] ?? '');
    $token = session_token(substr($value, 2));

    return $token !== null && in_array(substr($value, 0, 2), ['p.', 's.'], true) ? [$token, $value[0] === 'p'] : null;
}
