<?php

declare(strict_types=1);

require dirname(__DIR__) . '/src/bootstrap.php';

$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$supabase = $app['supabase'];
$mail = $app['mail'];

$routes = [
    '/api/health' => ['GET' => fn () => json_response(health_response($app))],
    '/api/auth/session' => ['GET' => fn () => auth_session($supabase)],
    '/api/auth/sign-in' => ['POST' => fn () => auth_sign_in($supabase)],
    '/api/auth/sign-up' => ['POST' => fn () => auth_sign_up($supabase, $mail)],
    '/api/auth/verify' => ['POST' => fn () => auth_verify($supabase)],
    '/api/auth/resend' => ['POST' => fn () => auth_resend($supabase, $mail)],
    '/api/auth/forgot' => ['POST' => fn () => auth_forgot($supabase, $mail)],
    '/api/auth/reset' => ['POST' => fn () => auth_reset($supabase)],
    '/api/auth/sign-out' => ['POST' => fn () => auth_sign_out($supabase)],
    '/api/profile' => ['GET' => fn () => profile_show($supabase), 'PUT' => fn () => profile_save($supabase)],
    '/api/profile/preferences' => ['PATCH' => fn () => profile_preferences($supabase)],
    '/api/feed' => ['GET' => fn () => feed_show($supabase)],
    '/api/portfolio' => ['GET' => fn () => portfolio_show($supabase)],
    '/api/projects' => ['POST' => fn () => project_create($supabase), 'DELETE' => fn () => project_delete($supabase)],
    '/api/projects/media' => ['POST' => fn () => project_media_add($supabase)],
    '/api/projects/comments' => ['GET' => fn () => comments_show($supabase), 'POST' => fn () => comment_add($supabase), 'DELETE' => fn () => comment_delete($supabase)],
    '/api/notifications' => ['GET' => fn () => notifications_show($supabase), 'PATCH' => fn () => notifications_update($supabase), 'DELETE' => fn () => notifications_delete($supabase)],
    '/api/projects/like' => ['POST' => fn () => community_toggle($supabase, 'toggle_like', 'project')],
    '/api/projects/save' => ['POST' => fn () => community_toggle($supabase, 'toggle_bookmark', 'project')],
    '/api/projects/view' => ['POST' => fn () => project_view($supabase)],
    '/api/creators/follow' => ['POST' => fn () => community_toggle($supabase, 'toggle_follow', 'creator')],
];

$route = $routes[$path] ?? null;
if ($route === null) {
    json_response(['error' => 'Route not found.'], 404);
}

$handler = $route[$method === 'HEAD' ? 'GET' : $method] ?? null;
if ($handler === null) {
    header('Allow: ' . implode(', ', [...array_keys($route), ...(isset($route['GET']) ? ['HEAD'] : [])]));
    json_response(['error' => 'Method not allowed.'], 405);
}

// Pins a new tab to the account it is using, so later sign-ins in other tabs don't switch it.
if (slot_signed_in(session_slot())) {
    header('X-Showlio-Slot: ' . session_slot());
}
$handler();
