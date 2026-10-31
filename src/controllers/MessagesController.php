<?php

declare(strict_types=1);

// /api/messages handlers: direct messages between members, one database call each,
// made with the member's own token. The workspace polls the list and the open
// conversation every few seconds, so new messages appear without a refresh.

const CHAT_THEMES = ['showlio', 'ocean', 'violet', 'sunset', 'rose', 'forest', 'midnight'];

/** A database time as milliseconds for the browser (kept exact, for "Seen"), or null. */
function message_time(mixed $value): ?int
{
    return is_string($value) && $value !== '' ? (int) (new DateTimeImmutable($value))->format('Uv') : null;
}

/**
 * @param array{url: string, publishable_key: string, secret_key: string} $supabase
 * @param array<string, mixed> $person
 * @return array<string, mixed>
 */
function message_person(array $supabase, array $person): array
{
    $card = ['id' => $person['id'], 'username' => $person['username'], 'name' => $person['name'], 'avatar' => avatar_url($supabase, $person['avatarPath'] ?? null)];
    foreach (['headline', 'location'] as $key) {
        if (array_key_exists($key, $person)) {
            $card[$key] = (string) $person[$key];
        }
    }
    if (array_key_exists('activeAt', $person)) {
        $card['activeAt'] = message_time($person['activeAt']); // null: hidden or never seen
    }

    return $card;
}

/** @param array<string, mixed> $message */
function message_card(array $message): array
{
    return ['id' => $message['id'], 'body' => $message['body'], 'mine' => (bool) $message['mine'], 'created' => message_time($message['createdAt'])];
}

/** @param array{url: string, publishable_key: string, secret_key: string} $supabase */
function messages_list(array $supabase): never
{
    [$status, $rows] = creator_rpc($supabase, 'my_conversations');
    if ($status !== 200 || !is_array($rows)) {
        rpc_failure($status, $rows, 'Messages aren’t available right now.');
    }
    $conversations = array_map(static fn (array $row): array => message_person($supabase, $row) + [
        'lastMessage' => (string) ($row['lastMessage'] ?? ''),
        'lastMine' => (bool) ($row['lastMine'] ?? false),
        'lastAt' => message_time($row['lastAt']),
        'theme' => (string) ($row['theme'] ?? 'showlio'),
        'unread' => (int) $row['unread'],
    ], $rows);
    json_response(['conversations' => $conversations, 'unread' => array_sum(array_column($conversations, 'unread'))]);
}

/** @param array{url: string, publishable_key: string, secret_key: string} $supabase */
function messages_thread(array $supabase): never
{
    $other = uuid_input($_GET['with'] ?? null);
    [$status, $thread] = creator_rpc($supabase, 'conversation_messages', ['other' => $other]);
    if ($status !== 200 || !is_array($thread)) {
        rpc_failure($status, $thread, 'That member isn’t available.');
    }
    json_response([
        'partner' => message_person($supabase, $thread['partner']),
        'theme' => (string) ($thread['theme'] ?? 'showlio'),
        'partnerReadAt' => message_time($thread['partnerReadAt'] ?? null),
        'messages' => array_map('message_card', $thread['messages']),
    ]);
}

/** @param array{url: string, publishable_key: string, secret_key: string} $supabase */
function messages_send(array $supabase): never
{
    $input = read_json_body();
    $to = uuid_input($input['to'] ?? null);
    $body = trim(str_replace("\r\n", "\n", input_string($input, 'body')));
    if ($body === '' || mb_strlen($body) > 2000) {
        invalid_input(['body' => $body === '' ? 'Write a message first.' : 'Keep messages within 2,000 characters.']);
    }
    [$status, $message] = creator_rpc($supabase, 'send_message', ['recipient' => $to, 'body' => $body]);
    if ($status !== 200 || !is_array($message)) {
        if (is_array($message) && ($message['code'] ?? '') === '22023') {
            invalid_input(['body' => (string) ($message['message'] ?? 'That message can’t be sent.')]);
        }
        rpc_failure($status, $message, 'That member isn’t available.');
    }
    json_response(['message' => message_card($message)], 201);
}

/** @param array{url: string, publishable_key: string, secret_key: string} $supabase */
function messages_people(array $supabase): never
{
    $query = trim(is_string($_GET['q'] ?? null) ? $_GET['q'] : '');
    if (mb_strlen($query) > 40) {
        invalid_input(['q' => 'Search with 40 characters or fewer.']);
    }
    [$status, $people] = creator_rpc($supabase, 'find_members', ['query' => $query]);
    if ($status !== 200 || !is_array($people)) {
        rpc_failure($status, $people, 'Members aren’t available right now.');
    }
    json_response(['people' => array_map(static fn (array $person): array => message_person($supabase, $person), $people)]);
}

/** @param array{url: string, publishable_key: string, secret_key: string} $supabase */
function messages_theme(array $supabase): never
{
    $input = read_json_body();
    $other = uuid_input($input['with'] ?? null);
    $theme = input_string($input, 'theme');
    if (!in_array($theme, CHAT_THEMES, true)) {
        invalid_input(['theme' => 'Choose one of the chat themes.']);
    }
    [$status, $data] = creator_rpc($supabase, 'set_conversation_theme', ['other' => $other, 'choice' => $theme]);
    if ($status !== 200 || !is_array($data)) {
        rpc_failure($status, $data, 'Send a message first, then choose a theme.');
    }
    json_response(['theme' => $data['theme']]);
}
