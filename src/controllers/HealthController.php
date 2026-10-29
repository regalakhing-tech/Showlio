<?php

declare(strict_types=1);

/**
 * PHP liveness only; this does not check Supabase, Storage or Gemini.
 * @param array<string, string> $app
 * @return array{status: string, app: string}
 */
function health_response(array $app): array
{
    return ['status' => 'ok', 'app' => $app['name']];
}
