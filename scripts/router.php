<?php

declare(strict_types=1);

// PHP development server only. Vercel routing lives in vercel.json.
$path = rawurldecode(parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/');

if ($path === '/api' || str_starts_with($path, '/api/')) {
    require dirname(__DIR__) . '/api/index.php';
    exit;
}

$publicRoot = realpath(dirname(__DIR__) . '/public');
// Single-page sections served from their folder index.
foreach (['app', 'auth', 'portfolio', 'portfolio/view'] as $section) {
    if ($path === '/' . $section) {
        header('Location: /' . $section . '/', true, 308);
        return true;
    }
    if ($path === '/' . $section . '/') {
        header('Content-Type: text/html; charset=utf-8');
        header('X-Content-Type-Options: nosniff');
        readfile($publicRoot . '/' . $section . '/index.html');
        return true;
    }
}
$file = realpath($publicRoot . ($path === '/' ? '/index.html' : $path));
$hasHiddenSegment = preg_match('~(^|/)[.]~', str_replace('\\', '/', $path)) === 1;

if (!$hasHiddenSegment && $file !== false && is_file($file)
    && str_starts_with($file, $publicRoot . DIRECTORY_SEPARATOR)
    && in_array(strtolower(pathinfo($file, PATHINFO_EXTENSION)), ['html', 'css', 'js', 'svg', 'png', 'jpg', 'jpeg', 'webp', 'ico', 'txt', 'woff2'], true)) {
    return false;
}

http_response_code(404);
header('Content-Type: text/plain; charset=utf-8');
header('X-Content-Type-Options: nosniff');
echo 'Page not found.';
