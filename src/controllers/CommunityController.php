<?php

declare(strict_types=1);

// /api/feed, /api/projects and /api/creators handlers: the Explore feed,
// posting and deleting projects, likes, saves, views and follows. Every call
// runs as the signed-in creator, so Row Level Security decides what they reach.

const COVER_PLACEHOLDER = '/assets/images/workspace-content.webp';

/**
 * Signed links for private project photos, valid for 12 hours. One call for the whole feed.
 * @param array{url: string, publishable_key: string, secret_key: string} $supabase
 * @param list<string> $paths
 * @return array<string, string> path => URL
 */
function sign_project_media(array $supabase, ?string $token, array $paths): array
{
    if ($paths === []) {
        return [];
    }
    [$status, $data] = supabase_request($supabase, 'POST', '/storage/v1/object/sign/project-media', ['expiresIn' => 43200, 'paths' => $paths], $token);
    if ($status !== 200 || !is_array($data)) {
        error_log('Signing project photos failed with status ' . $status . '.');
        return []; // Covers fall back to the placeholder rather than breaking the feed.
    }
    $urls = [];
    foreach ($data as $item) {
        if (is_string($item['path'] ?? null) && is_string($item['signedURL'] ?? null)) {
            $urls[$item['path']] = rtrim($supabase['url'], '/') . '/storage/v1' . $item['signedURL'];
        }
    }

    return $urls;
}

/**
 * A project in the shape the workspace cards use for sample projects too.
 * @param array<string, mixed> $project a workspace_feed() project
 * @return array<string, mixed>
 */
function project_card(array $project, string $me, bool $liked, array $images): array
{
    return [
        'id' => $project['id'],
        'title' => $project['title'],
        'description' => $project['summary'],
        'image' => $images[0] ?? COVER_PLACEHOLDER,
        'images' => $images,
        'categories' => $project['categories'] ?: ['Other'],
        'tools' => $project['tools'],
        'creator' => $project['creatorId'],
        'owner' => $project['creatorId'] === $me,
        'views' => (int) $project['views'],
        // Cards add the viewer's own like on top, the same way they do for sample projects.
        'likes' => max(0, (int) $project['likes'] - ($liked ? 1 : 0)),
        'comments' => (int) ($project['comments'] ?? 0),
        'saves' => (int) ($project['saves'] ?? 0),
        'created' => (int) (strtotime((string) $project['shownAt']) * 1000),
        'duration' => (string) ($project['duration'] ?? ''),
        'draft' => $project['visibility'] !== 'published',
        'real' => true,
    ];
}

/**
 * @param array{url: string, publishable_key: string, secret_key: string} $supabase
 * @param array<string, mixed> $creator a workspace_feed() creator
 * @return array<string, mixed>
 */
function creator_card(array $supabase, array $creator): array
{
    return [
        'id' => $creator['id'],
        'name' => $creator['name'],
        'role' => $creator['headline'] !== '' ? $creator['headline'] : '@' . $creator['username'],
        'username' => $creator['username'],
        'bio' => $creator['bio'],
        'avatar' => avatar_url($supabase, $creator['avatarPath']),
        'followers' => (int) $creator['followers'],
        'hue' => hexdec(substr((string) $creator['id'], 0, 2)) * 360 >> 8, // A steady monogram colour per person.
        'real' => true,
    ];
}

/** @param array{url: string, publishable_key: string, secret_key: string} $supabase */
function feed_show(array $supabase): never
{
    [$status, $feed] = creator_rpc($supabase, 'workspace_feed');
    if ($status !== 200 || !is_array($feed)) {
        rpc_failure($status, $feed, 'The feed is unavailable right now.');
    }
    $token = user_token($supabase);
    $me = (string) (token_claims($token)['sub'] ?? '');
    $liked = array_flip($feed['likes']);
    // Every photo in order; feeds from before the gallery migration list only the cover.
    $photos = static fn (array $project): array => $project['mediaPaths'] ?? array_values(array_filter([$project['coverPath'] ?? null]));
    $paths = [];
    foreach ($feed['projects'] as $project) {
        array_push($paths, ...$photos($project));
    }
    $urls = sign_project_media($supabase, $token, array_values(array_unique($paths)));
    $gallery = static fn (array $project): array => array_values(array_filter(array_map(static fn (string $path): ?string => $urls[$path] ?? null, $photos($project))));

    json_response([
        'projects' => array_map(static fn (array $project): array => project_card($project, $me, isset($liked[$project['id']]), $gallery($project)), $feed['projects']),
        'creators' => array_map(static fn (array $creator): array => creator_card($supabase, $creator), $feed['creators']),
        'likes' => $feed['likes'],
        'bookmarks' => $feed['bookmarks'],
        'following' => $feed['following'],
    ]);
}

/**
 * A creator's portfolio page: GET /api/portfolio?u=username. Guests can open it
 * too; creators also see their own while it is private.
 * @param array{url: string, publishable_key: string, secret_key: string} $supabase
 */
function portfolio_show(array $supabase): never
{
    $username = strtolower(trim(is_string($_GET['u'] ?? null) ? $_GET['u'] : ''));
    $missing = 'This portfolio isn’t public, or the link is wrong.';
    if (preg_match('/^[a-z0-9_]{3,20}$/', $username) !== 1) {
        json_response(['error' => $missing], 404);
    }
    $token = optional_user_token($supabase);
    [$status, $page] = supabase_request($supabase, 'POST', '/rest/v1/rpc/creator_portfolio', ['handle' => $username], $token);
    if ($status !== 200) {
        rpc_failure($status, $page, $missing);
    }
    if (!is_array($page)) {
        json_response(['error' => $missing], 404);
    }
    $paths = [];
    foreach ($page['projects'] as $project) {
        array_push($paths, ...$project['mediaPaths']);
    }
    $urls = sign_project_media($supabase, $token, array_values(array_unique($paths)));
    $profile = $page['profile'];

    json_response([
        'profile' => [
            'id' => $profile['id'],
            'username' => $profile['username'],
            'name' => $profile['name'],
            'headline' => $profile['headline'],
            'bio' => $profile['bio'],
            'location' => $profile['location'],
            'availability' => (string) ($profile['availability'] ?? ''),
            'avatar' => avatar_url($supabase, $profile['avatarPath']),
            'hue' => hexdec(substr((string) $profile['id'], 0, 2)) * 360 >> 8,
            'visible' => (bool) $profile['visible'],
            'own' => (bool) $profile['own'],
            'joined' => (int) (strtotime((string) $profile['joinedAt']) * 1000),
        ],
        'skills' => $page['skills'],
        'links' => $page['links'],
        'followers' => (int) $page['followers'],
        'projects' => array_map(static fn (array $project): array => [
            'id' => $project['id'],
            'title' => $project['title'],
            'description' => $project['summary'],
            'categories' => $project['categories'] ?: ['Other'],
            'tools' => $project['tools'],
            'images' => array_values(array_filter(array_map(static fn (string $path): ?string => $urls[$path] ?? null, $project['mediaPaths']))),
            'likes' => (int) $project['likes'],
            'views' => (int) $project['views'],
            'comments' => (int) $project['comments'],
            'created' => (int) (strtotime((string) $project['shownAt']) * 1000),
        ], $page['projects']),
    ]);
}

/** @param array{url: string, publishable_key: string, secret_key: string} $supabase */
function project_create(array $supabase): never
{
    [$values, $errors] = validate_project(read_json_body());
    if ($errors !== []) {
        invalid_input($errors);
    }
    [$status, $created] = creator_rpc($supabase, 'create_my_project', ['project' => [
        'title' => $values['title'],
        'summary' => $values['description'],
        'categories' => [$values['category']],
        'tools' => $values['tools'],
    ]]);
    if ($status !== 200 || !is_string($created['id'] ?? null)) {
        rpc_failure($status, $created, 'Your profile isn’t ready yet. Confirm your email, then sign in again.');
    }
    $token = user_token($supabase);
    $me = (string) (token_claims($token)['sub'] ?? '');

    // Others only see projects of public profiles. The composer offers to make the profile
    // public when it isn't; the creator's own token and RLS decide whether that is allowed.
    $profilePublic = false;
    if ($values['makePublic']) {
        [$status] = supabase_request($supabase, 'PATCH', '/rest/v1/profiles?id=eq.' . rawurlencode($me), ['visibility' => 'public'], $token, headers: ['Prefer: return=minimal']);
        $profilePublic = $status >= 200 && $status < 300;
        if (!$profilePublic) {
            error_log('Making the profile public failed with status ' . $status . '.');
        }
    }

    // Photos follow with one request each (POST /api/projects/media), so every request stays small.
    json_response(['profilePublic' => $profilePublic, 'project' => project_card([
        'id' => $created['id'], 'title' => $values['title'], 'summary' => $values['description'], 'categories' => [$values['category']],
        'tools' => $values['tools'], 'creatorId' => $me, 'views' => 0, 'likes' => 0, 'duration' => '',
        'shownAt' => gmdate('c'), 'visibility' => 'published',
    ], $me, false, [])], 201);
}

/**
 * Adds one photo to the creator's project. Position 0 is the cover.
 * @param array{url: string, publishable_key: string, secret_key: string} $supabase
 */
function project_media_add(array $supabase): never
{
    // One photo: the workspace sends a WebP of at most 1600px; allow up to 2 MB once base64-encoded.
    $input = read_json_body(3 * 1024 * 1024);
    $project = uuid_input($input['project'] ?? null);
    $position = $input['position'] ?? null;
    [$image, $imageError] = image_upload($input['image'] ?? null);
    if ($image === null) {
        invalid_input(['image' => $imageError ?? 'Choose a photo to add.']);
    }
    if (!is_int($position) || $position < 0 || $position > 9) {
        invalid_input(['position' => 'A project holds up to 10 photos.']);
    }

    $token = user_token($supabase);
    // Storage only accepts uploads into the creator's own {user}/{project}/ folder, for a project they own.
    $path = (string) (token_claims($token)['sub'] ?? '') . '/' . $project . '/' . bin2hex(random_bytes(12)) . '.' . $image['extension'];
    [$status, $body] = supabase_request($supabase, 'POST', '/storage/v1/object/project-media/' . $path, $image['bytes'], $token, headers: ['Content-Type: ' . $image['type']], timeout: 45);
    if ($status !== 200) {
        error_log('Project photo upload failed with status ' . $status . ': ' . json_encode($body));
        json_response(['error' => 'Couldn’t upload that photo. Try again or choose a different one.'], 502);
    }
    [$status, $body] = supabase_request($supabase, 'POST', '/rest/v1/project_media', [
        'project_id' => $project, 'storage_path' => $path, 'alt_text' => '', 'width' => $image['width'], 'height' => $image['height'], 'sort_order' => $position,
    ], $token, headers: ['Prefer: return=minimal']);
    if ($status < 200 || $status > 299) {
        supabase_request($supabase, 'DELETE', '/storage/v1/object/project-media', ['prefixes' => [$path]], $token);
        rpc_failure($status, $body, 'That project no longer exists.');
    }
    json_response(['path' => $path], 201);
}

/** @param array{url: string, publishable_key: string, secret_key: string} $supabase */
function project_delete(array $supabase): never
{
    $id = uuid_input($_GET['id'] ?? null);
    [$status, $paths] = creator_rpc($supabase, 'delete_my_project', ['project' => $id]);
    if ($status !== 200 || !is_array($paths)) {
        rpc_failure($status, $paths, 'That project no longer exists.');
    }
    if ($paths !== []) {
        supabase_request($supabase, 'DELETE', '/storage/v1/object/project-media', ['prefixes' => $paths], user_token($supabase));
    }
    json_response(['deleted' => true]);
}

/**
 * Like, save and follow switches: one call, answering with the new state and count.
 * @param array{url: string, publishable_key: string, secret_key: string} $supabase
 */
function community_toggle(array $supabase, string $function, string $argument): never
{
    $id = uuid_input(read_json_body()['id'] ?? null);
    [$status, $data] = creator_rpc($supabase, $function, [$argument => $id]);
    if ($status !== 200 || !is_array($data)) {
        rpc_failure($status, $data, 'That no longer exists. Refresh and try again.');
    }
    json_response($data);
}

/** @param array{url: string, publishable_key: string, secret_key: string} $supabase */
function project_view(array $supabase): never
{
    $id = uuid_input(read_json_body()['id'] ?? null);
    [$status, $data] = creator_rpc($supabase, 'record_project_view', ['project_id' => $id]);
    if ($status < 200 || $status > 299) {
        rpc_failure($status, $data, 'That project no longer exists.');
    }
    json_response(['viewed' => true]);
}

/**
 * @param array{url: string, publishable_key: string, secret_key: string} $supabase
 * @param array<string, mixed> $comment a project_comments_list() item
 * @return array<string, mixed>
 */
function comment_card(array $supabase, array $comment): array
{
    return [
        'id' => $comment['id'],
        'body' => $comment['body'],
        'created' => (int) (strtotime((string) $comment['createdAt']) * 1000),
        'author' => $comment['authorId'],
        'username' => $comment['username'],
        'name' => $comment['name'],
        'avatar' => avatar_url($supabase, $comment['avatarPath']),
        'mine' => (bool) $comment['mine'],
        'canDelete' => (bool) $comment['canDelete'],
    ];
}

/** @param array{url: string, publishable_key: string, secret_key: string} $supabase */
function comments_show(array $supabase): never
{
    $project = uuid_input($_GET['project'] ?? null);
    [$status, $comments] = creator_rpc($supabase, 'project_comments_list', ['project' => $project]);
    if ($status !== 200 || !is_array($comments)) {
        rpc_failure($status, $comments, 'That project no longer exists.');
    }
    json_response(['comments' => array_map(static fn (array $comment): array => comment_card($supabase, $comment), $comments)]);
}

/** @param array{url: string, publishable_key: string, secret_key: string} $supabase */
function comment_add(array $supabase): never
{
    $input = read_json_body();
    $project = uuid_input($input['project'] ?? null);
    $body = trim(str_replace("\r\n", "\n", input_string($input, 'body')));
    if ($body === '' || mb_strlen($body) > 1000) {
        invalid_input(['body' => $body === '' ? 'Write a comment first.' : 'Keep comments within 1,000 characters.']);
    }
    [$status, $comment] = creator_rpc($supabase, 'add_project_comment', ['project' => $project, 'body' => $body]);
    if ($status !== 200 || !is_array($comment)) {
        rpc_failure($status, $comment, 'That project no longer exists.');
    }
    json_response(['comment' => comment_card($supabase, $comment)], 201);
}

/** @param array{url: string, publishable_key: string, secret_key: string} $supabase */
function comment_delete(array $supabase): never
{
    $id = uuid_input($_GET['id'] ?? null);
    [$status, $data] = creator_rpc($supabase, 'delete_project_comment', ['comment' => $id]);
    if ($status < 200 || $status > 299) {
        rpc_failure($status, $data, 'That comment was already removed.');
    }
    json_response(['deleted' => true]);
}

/**
 * @param array{url: string, publishable_key: string, secret_key: string} $supabase
 * @param array<string, mixed> $item a my_notifications() item
 * @return array<string, mixed>
 */
function notification_card(array $supabase, array $item): array
{
    $actor = is_array($item['actor'] ?? null) ? $item['actor'] : null;

    return [
        'id' => $item['id'],
        'type' => $item['type'],
        'title' => (string) $item['title'],
        'body' => (string) $item['body'],
        'created' => (int) (strtotime((string) $item['createdAt']) * 1000),
        'unread' => !$item['read'],
        'saved' => (bool) $item['saved'],
        'actor' => $actor === null ? null : [
            'id' => $actor['id'],
            'username' => $actor['username'],
            'name' => $actor['name'],
            'role' => $actor['headline'] !== '' ? $actor['headline'] : '@' . $actor['username'],
            'avatar' => avatar_url($supabase, $actor['avatarPath']),
            'hue' => hexdec(substr((string) $actor['id'], 0, 2)) * 360 >> 8,
        ],
        'project' => is_array($item['project'] ?? null) ? $item['project'] : null,
    ];
}

/** @param array{url: string, publishable_key: string, secret_key: string} $supabase */
function notifications_show(array $supabase): never
{
    [$status, $data] = creator_rpc($supabase, 'my_notifications');
    if ($status !== 200 || !is_array($data)) {
        rpc_failure($status, $data, 'Notifications are unavailable right now.');
    }
    json_response([
        'notifications' => array_map(static fn (array $item): array => notification_card($supabase, $item), $data['notifications']),
        'followers' => (int) $data['followers'],
    ]);
}

/**
 * Marks one notification read or unread and saved or not, or every notification read ({ all: true }).
 * Recipients may change only these two columns; Row Level Security limits them to their own.
 * @param array{url: string, publishable_key: string, secret_key: string} $supabase
 */
function notifications_update(array $supabase): never
{
    $input = read_json_body();
    $token = user_token($supabase);
    $now = gmdate('Y-m-d\TH:i:s\Z');
    if (($input['all'] ?? false) === true) {
        $me = rawurlencode((string) (token_claims($token)['sub'] ?? ''));
        [$status, $data] = supabase_request($supabase, 'PATCH', "/rest/v1/notifications?recipient_id=eq.$me&read_at=is.null", ['read_at' => $now], $token, headers: ['Prefer: return=minimal']);
    } else {
        $id = rawurlencode(uuid_input($input['id'] ?? null));
        $changes = [];
        if (is_bool($input['read'] ?? null)) {
            $changes['read_at'] = $input['read'] ? $now : null;
        }
        if (is_bool($input['saved'] ?? null)) {
            $changes['is_saved'] = $input['saved'];
        }
        if ($changes === []) {
            invalid_input(['read' => 'Choose what to change.']);
        }
        [$status, $data] = supabase_request($supabase, 'PATCH', "/rest/v1/notifications?id=eq.$id", $changes, $token, headers: ['Prefer: return=minimal']);
    }
    if ($status < 200 || $status > 299) {
        rpc_failure($status, $data, 'That notification no longer exists.');
    }
    json_response(['updated' => true]);
}

/** @param array{url: string, publishable_key: string, secret_key: string} $supabase */
function notifications_delete(array $supabase): never
{
    $id = rawurlencode(uuid_input($_GET['id'] ?? null));
    [$status, $data] = supabase_request($supabase, 'DELETE', "/rest/v1/notifications?id=eq.$id", null, user_token($supabase), headers: ['Prefer: return=minimal']);
    if ($status < 200 || $status > 299) {
        rpc_failure($status, $data, 'That notification no longer exists.');
    }
    json_response(['deleted' => true]);
}
