<?php

declare(strict_types=1);

/** @param array<string, mixed> $payload */
function json_response(array $payload, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');

    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'HEAD') {
        echo json_encode($payload, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES);
    }

    exit;
}

/**
 * The request's JSON object. Requiring application/json also stops plain
 * cross-site form posts: browsers must preflight it, and this API allows no CORS.
 * @return array<string, mixed>
 */
function read_json_body(int $maxBytes = 16384): array
{
    if (!str_starts_with(strtolower((string) ($_SERVER['CONTENT_TYPE'] ?? '')), 'application/json')) {
        json_response(['error' => 'Send the request as JSON.'], 415);
    }

    $raw = (string) file_get_contents('php://input', false, null, 0, $maxBytes + 1);
    if (strlen($raw) > $maxBytes) {
        json_response(['error' => 'Request is too large.'], 413);
    }

    $input = json_decode($raw === '' ? '{}' : $raw, true, 8);
    if (!is_array($input) || ($input !== [] && array_is_list($input))) {
        json_response(['error' => 'Send a JSON object.'], 400);
    }

    return $input;
}

/** @param array<string, string> $errors field name => message */
function invalid_input(array $errors): never
{
    json_response(['error' => 'Check the highlighted fields.', 'errors' => $errors], 422);
}

/** The visitor's IP address, for rate limits. */
function client_ip(): string
{
    // Vercel overwrites X-Forwarded-For with the real client address, so clients cannot spoof it there.
    // Re-check this if Showlio moves to a host that passes the header through.
    $forwarded = trim(explode(',', (string) ($_SERVER['HTTP_X_FORWARDED_FOR'] ?? ''))[0]);

    return $forwarded !== '' ? $forwarded : (string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown');
}
