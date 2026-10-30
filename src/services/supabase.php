<?php

declare(strict_types=1);

/**
 * Calls the Supabase Auth, REST or Storage API. The secret key is used only when $secret is true.
 * An array body is sent as JSON; a string body (a file upload) is sent as-is with the Content-Type in $headers.
 * @param array{url: string, publishable_key: string, secret_key: string} $supabase
 * @param array<int|string, mixed>|string|null $body
 * @param list<string> $headers extra request headers
 * @return array{0: int, 1: mixed} HTTP status (0 when Supabase is unreachable or not configured) and decoded JSON
 */
function supabase_request(array $supabase, string $method, string $path, array|string|null $body = null, ?string $accessToken = null, bool $secret = false, array $headers = [], int $timeout = 10): array
{
    $key = $secret ? $supabase['secret_key'] : $supabase['publishable_key'];
    if ($supabase['url'] === '' || $key === '') {
        error_log('Supabase is not configured: set SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY.');
        return [0, null];
    }

    $headers = ['apikey: ' . $key, 'Accept: application/json', ...$headers];
    if ($accessToken !== null) {
        $headers[] = 'Authorization: Bearer ' . $accessToken;
    }
    if (is_array($body)) {
        $headers[] = 'Content-Type: application/json';
    }

    $curl = curl_init(rtrim($supabase['url'], '/') . $path);
    curl_setopt_array($curl, [
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_TIMEOUT => $timeout,
        CURLOPT_PROTOCOLS => CURLPROTO_HTTPS | CURLPROTO_HTTP,
    ]);
    if (PHP_OS_FAMILY === 'Windows') {
        // Windows PHP ships without a CA bundle; trust the system certificate store for local development.
        curl_setopt($curl, CURLOPT_SSL_OPTIONS, CURLSSLOPT_NATIVE_CA);
    }
    if ($body !== null) {
        curl_setopt($curl, CURLOPT_POSTFIELDS, is_array($body) ? json_encode($body, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES) : $body);
    }

    $response = curl_exec($curl);
    if (!is_string($response)) {
        error_log('Supabase request failed: ' . curl_error($curl));
        return [0, null];
    }

    return [curl_getinfo($curl, CURLINFO_RESPONSE_CODE), json_decode($response, true)];
}

/** The machine-readable Supabase Auth error code, e.g. invalid_credentials. */
function supabase_error_code(mixed $body): string
{
    return is_array($body) ? (string) ($body['error_code'] ?? $body['error'] ?? '') : '';
}

/**
 * Calls Supabase Auth on behalf of the visitor. Supabase limits Auth per IP address, and every
 * request reaches it from this server, so all visitors would share one limit. Passing the
 * visitor's IP in Sb-Forwarded-For gives each person their own. Supabase only honours the
 * header with the secret key, once IP Address Forwarding is on (Dashboard > Authentication > Rate Limits).
 * @param array{url: string, publishable_key: string, secret_key: string} $supabase
 * @param array<string, mixed>|null $body
 * @return array{0: int, 1: mixed}
 */
function auth_request(array $supabase, string $method, string $path, ?array $body = null, ?string $accessToken = null): array
{
    $ip = filter_var(client_ip(), FILTER_VALIDATE_IP);
    $forward = $ip !== false && $supabase['secret_key'] !== '';

    return supabase_request($supabase, $method, $path, $body, $accessToken, $forward, $forward ? ['Sb-Forwarded-For: ' . $ip] : []);
}
