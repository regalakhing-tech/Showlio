<?php

declare(strict_types=1);

// Sign-in and account-email limits, counted in Supabase (private.auth_attempts)
// because Vercel functions share no memory or disk between requests.

/** Hashed so the database never stores raw emails or IP addresses. */
function attempt_key(string $action, string $value): string
{
    return $action . ':' . hash('sha256', strtolower($value));
}

/**
 * Counts this attempt against every key, or stops the request with 429.
 * Fails closed: if the limit cannot be checked, nobody gets unlimited guesses.
 * @param array{url: string, publishable_key: string, secret_key: string} $supabase
 * @param array<string, int> $limits attempt key => attempts allowed per window
 */
function rate_limit(array $supabase, array $limits, int $windowSeconds): void
{
    [$status, $wait] = supabase_request($supabase, 'POST', '/rest/v1/rpc/auth_attempt', [
        'keys' => array_keys($limits),
        'limits' => array_values($limits),
        'window_seconds' => $windowSeconds,
    ], secret: true);

    if ($status !== 200 || !is_int($wait)) {
        error_log('Rate limit check failed with status ' . $status . '.');
        json_response(['error' => 'Sign-in is temporarily unavailable. Try again in a moment.'], 503);
    }

    if ($wait > 0) {
        $minutes = (int) ceil($wait / 60);
        header('Retry-After: ' . $wait);
        json_response(['error' => sprintf('Too many attempts. Try again in %d %s.', $minutes, $minutes === 1 ? 'minute' : 'minutes')], 429);
    }
}

/**
 * @param array{url: string, publishable_key: string, secret_key: string} $supabase
 * @param list<string> $keys
 */
function rate_limit_clear(array $supabase, array $keys): void
{
    [$status] = supabase_request($supabase, 'POST', '/rest/v1/rpc/auth_clear', ['keys' => $keys], secret: true);
    if ($status < 200 || $status > 299) {
        error_log('Rate limit reset failed with status ' . $status . '.');
    }
}

/**
 * Gives back the attempt just counted for each key, for code emails Supabase never sent.
 * @param array{url: string, publishable_key: string, secret_key: string} $supabase
 * @param list<string> $keys
 */
function rate_limit_refund(array $supabase, array $keys): void
{
    [$status] = supabase_request($supabase, 'POST', '/rest/v1/rpc/auth_refund', ['keys' => $keys], secret: true);
    if ($status < 200 || $status > 299) {
        error_log('Rate limit refund failed with status ' . $status . '.');
    }
}
