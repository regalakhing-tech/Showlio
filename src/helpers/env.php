<?php

declare(strict_types=1);

// Local development only: Vercel provides real process variables and never
// receives .env. Values already set in the process environment always win.
function load_env_file(string $path): void
{
    if (!is_file($path) || !is_readable($path)) {
        return;
    }

    foreach (file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#') || !str_contains($line, '=')) {
            continue;
        }

        [$name, $value] = array_map('trim', explode('=', $line, 2));
        if (preg_match('/^[A-Z][A-Z0-9_]*$/', $name) !== 1 || getenv($name) !== false) {
            continue;
        }
        if (strlen($value) >= 2 && ($value[0] === '"' || $value[0] === "'") && $value[-1] === $value[0]) {
            $value = substr($value, 1, -1);
        }

        putenv($name . '=' . $value);
    }
}
