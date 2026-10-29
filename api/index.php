<?php

declare(strict_types=1);

require dirname(__DIR__) . '/src/bootstrap.php';

$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($path !== '/api/health') {
    json_response(['error' => 'Route not found.'], 404);
}

if (!in_array($method, ['GET', 'HEAD'], true)) {
    header('Allow: GET, HEAD');
    json_response(['error' => 'Method not allowed.'], 405);
}

json_response(health_response($app));
