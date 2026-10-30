<?php

declare(strict_types=1);

// Server-side copies of the form rules in public/assets/js/auth-model.js.
// The browser checks only save a round trip; these are the ones that count.
// Each validate_* returns [clean values, field name => message].

/** @param array<string, mixed> $input */
function input_string(array $input, string $name): string
{
    $value = $input[$name] ?? '';

    return is_string($value) && mb_check_encoding($value, 'UTF-8') ? $value : '';
}

function email_error(string $email): ?string
{
    if ($email === '') {
        return 'Enter your email address.';
    }

    return strlen($email) > 254 || preg_match('/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u', $email) !== 1
        ? 'Enter a valid email, like you@yourdomain.com.'
        : null;
}

/** @param array<string, mixed> $input */
function clean_email(array $input): string
{
    return strtolower(trim(input_string($input, 'email')));
}

/** @return array<string, string> */
function new_password_errors(string $password, string $confirm): array
{
    $errors = [];
    if (mb_strlen($password) < 8) {
        $errors['password'] = 'Use at least 8 characters.';
    } elseif (strlen($password) > 72) {
        // Supabase hashes passwords with bcrypt, which only reads 72 bytes.
        $errors['password'] = 'Use 72 characters or fewer.';
    }
    if ($confirm === '') {
        $errors['confirm'] = 'Confirm your password.';
    } elseif ($confirm !== $password) {
        $errors['confirm'] = 'Passwords don’t match.';
    }

    return $errors;
}

function code_error(string $code): ?string
{
    return preg_match('/^[0-9]{6}$/', $code) === 1 ? null : 'Enter the 6-digit code from your email.';
}

/**
 * @param array<string, mixed> $input
 * @return array{0: array{email: string, password: string, remember: bool}, 1: array<string, string>}
 */
function validate_sign_in(array $input): array
{
    $email = clean_email($input);
    $password = input_string($input, 'password');
    $errors = array_filter([
        'email' => email_error($email),
        'password' => match (true) {
            $password === '' => 'Enter your password.',
            mb_strlen($password) < 8 => 'Passwords have at least 8 characters.',
            strlen($password) > 72 => 'Passwords have at most 72 characters.',
            default => null,
        },
    ]);

    return [['email' => $email, 'password' => $password, 'remember' => ($input['remember'] ?? false) === true], $errors];
}

/**
 * @param array<string, mixed> $input
 * @return array{0: array{name: string, username: string, email: string, password: string}, 1: array<string, string>}
 */
function validate_sign_up(array $input): array
{
    $name = trim((string) preg_replace('/\s+/u', ' ', input_string($input, 'name')));
    $username = strtolower(ltrim(trim(input_string($input, 'username')), '@'));
    $email = clean_email($input);
    $password = input_string($input, 'password');

    $errors = array_filter([
        'name' => match (true) {
            mb_strlen($name) < 2 => 'Enter your full name.',
            mb_strlen($name) > 60 => 'Use 60 characters or fewer.',
            preg_match('/\p{Cc}/u', $name) === 1 => 'Remove unsupported characters from your name.',
            default => null,
        },
        'username' => preg_match('/^[a-z0-9_]{3,20}$/', $username) === 1 ? null : 'Use 3 to 20 letters, numbers or underscores.',
        'email' => email_error($email),
        'terms' => ($input['terms'] ?? false) === true ? null : 'Accept the terms to create your account.',
    ]) + new_password_errors($password, input_string($input, 'confirm'));

    return [['name' => $name, 'username' => $username, 'email' => $email, 'password' => $password], $errors];
}

/**
 * @param array<string, mixed> $input
 * @return array{0: array{email: string}, 1: array<string, string>}
 */
function validate_email_only(array $input): array
{
    $email = clean_email($input);

    return [['email' => $email], array_filter(['email' => email_error($email)])];
}

/**
 * @param array<string, mixed> $input
 * @return array{0: array{email: string, code: string}, 1: array<string, string>}
 */
function validate_code(array $input): array
{
    $email = clean_email($input);
    $code = trim(input_string($input, 'code'));

    return [['email' => $email, 'code' => $code], array_filter(['email' => email_error($email), 'code' => code_error($code)])];
}

/**
 * @param array<string, mixed> $input
 * @return array{0: array{email: string, code: string, password: string}, 1: array<string, string>}
 */
function validate_reset(array $input): array
{
    [$values, $errors] = validate_code($input);
    $password = input_string($input, 'password');

    return [$values + ['password' => $password], $errors + new_password_errors($password, input_string($input, 'confirm'))];
}

/** Same rule as the public.https_url domain in the database. */
function https_url_error(string $url): ?string
{
    if ($url === '') {
        return null;
    }
    $parts = parse_url($url);

    return strlen($url) > 500 || isset($parts['user']) || isset($parts['pass'])
        || preg_match('~^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?([/?#][^\s]*)?$~', $url) !== 1
        ? 'Use a full https:// address without a username or password.'
        : null;
}

/**
 * A profile photo or project cover sent as a data URL, checked by its actual bytes.
 * @return array{0: ?array{type: string, extension: string, bytes: string, width: int, height: int}, 1: ?string} image (null when none) and error
 */
function image_upload(mixed $value): array
{
    if ($value === null || $value === '') {
        return [null, null];
    }
    $types = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];
    $error = 'Choose a JPG, PNG or WebP image smaller than 2 MB.';
    if (!is_string($value) || preg_match('~^data:(image/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+=*)$~', $value, $match) !== 1) {
        return [null, $error];
    }
    $bytes = base64_decode($match[2], true);
    $info = is_string($bytes) && strlen($bytes) <= 2 * 1024 * 1024 ? getimagesizefromstring($bytes) : false;
    if ($info === false || !isset($types[$info['mime']]) || $info[0] < 1 || $info[1] < 1) {
        return [null, $error];
    }

    return [['type' => $info['mime'], 'extension' => $types[$info['mime']], 'bytes' => $bytes, 'width' => $info[0], 'height' => $info[1]], null];
}

/**
 * Skills or tools: up to 15 names of 1–40 characters, duplicates dropped regardless of case.
 * @return list<string>|null null when the list is invalid
 */
function clean_tags(mixed $raw): ?array
{
    if (!is_array($raw) || !array_is_list($raw) || count($raw) > 15) {
        return null;
    }
    $tags = [];
    foreach ($raw as $tag) {
        $tag = is_string($tag) ? trim($tag) : '';
        if ($tag === '' || mb_strlen($tag) > 40) {
            return null;
        }
        $tags[mb_strtolower($tag)] ??= $tag;
    }

    return array_values($tags);
}

/**
 * The workspace profile form (Settings > Profile, Privacy and Social & Links).
 * @param array<string, mixed> $input
 * @return array{0: array{name: string, headline: string, bio: string, location: string, availability: string, visible: bool, skills: list<string>, links: array<string, string>, avatar: ?array{type: string, extension: string, bytes: string}}, 1: array<string, string>}
 */
function validate_profile(array $input): array
{
    $line = static fn (string $name): string => trim((string) preg_replace('/\s+/u', ' ', input_string($input, $name)));
    $name = $line('name');
    $headline = $line('headline');
    $bio = trim(str_replace("\r\n", "\n", input_string($input, 'bio')));
    $location = $line('location');
    $availability = input_string($input, 'availability');

    $skills = clean_tags($input['skills'] ?? []);

    $links = [];
    $linkErrors = [];
    foreach (['website', 'instagram', 'youtube'] as $kind) {
        $links[$kind] = trim(is_array($input['links'] ?? null) && is_string($input['links'][$kind] ?? null) ? $input['links'][$kind] : '');
        $linkErrors[] = https_url_error($links[$kind]);
    }
    [$avatar, $avatarError] = image_upload($input['avatar'] ?? null);

    $errors = array_filter([
        'name' => match (true) {
            $name === '' => 'Please enter your display name.',
            mb_strlen($name) > 60 => 'Keep your display name within 60 characters.',
            preg_match('/\p{Cc}/u', $name) === 1 => 'Remove unsupported characters from your name.',
            default => null,
        },
        'headline' => match (true) {
            $headline === '' => 'Please enter a headline.',
            mb_strlen($headline) > 100 => 'Keep your headline within 100 characters.',
            default => null,
        },
        'bio' => mb_strlen($bio) > 500 ? 'Keep your bio within 500 characters.' : null,
        'location' => mb_strlen($location) > 100 ? 'Keep your location within 100 characters.' : null,
        'availability' => in_array($availability, ['available', 'unavailable', 'showcasing'], true) ? null : 'Choose your collaboration availability.',
        'skills' => $skills === null ? 'Use up to 15 skills, with 1–40 characters each.' : null,
        'links' => array_values(array_filter($linkErrors))[0] ?? null,
        'avatar' => $avatarError,
    ]);

    return [[
        'name' => $name,
        'headline' => $headline,
        'bio' => $bio,
        'location' => $location,
        'availability' => $availability,
        'visible' => ($input['visible'] ?? false) === true,
        'skills' => $skills ?? [],
        'links' => $links,
        'avatar' => $avatar,
    ], $errors];
}

// Disciplines a project can be filed under; the names match public.categories.
const PROJECT_CATEGORIES = ['Development', 'AI Automation', 'Design', 'UI/UX', 'Video', 'Photography', 'Illustration', 'Digital Art', 'Writing', 'Music & Audio', 'Other'];

/**
 * The workspace "Add a project" form.
 * @param array<string, mixed> $input
 * @return array{0: array{title: string, description: string, category: string, tools: list<string>, makePublic: bool}, 1: array<string, string>}
 */
function validate_project(array $input): array
{
    $title = trim((string) preg_replace('/\s+/u', ' ', input_string($input, 'title')));
    $description = trim(str_replace("\r\n", "\n", input_string($input, 'description')));
    $category = input_string($input, 'category');
    $tools = clean_tags($input['tools'] ?? []);
    $errors = array_filter([
        'title' => match (true) {
            $title === '' => 'Add a project title.',
            mb_strlen($title) > 80 => 'Keep the title within 80 characters.',
            default => null,
        },
        'description' => match (true) {
            $description === '' => 'Describe your project in a sentence or two.',
            mb_strlen($description) > 300 => 'Keep the description within 300 characters.',
            default => null,
        },
        'category' => in_array($category, PROJECT_CATEGORIES, true) ? null : 'Choose a discipline.',
        'tools' => $tools === null ? 'Use up to 15 tools, with 1–40 characters each.' : null,
    ]);

    return [['title' => $title, 'description' => $description, 'category' => $category, 'tools' => $tools ?? [], 'makePublic' => ($input['makePublic'] ?? false) === true], $errors];
}

/** A project or creator id from the request, or a 422. */
function uuid_input(mixed $value): string
{
    if (!is_string($value) || preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/', $value) !== 1) {
        invalid_input(['id' => 'That item could not be found.']);
    }

    return $value;
}
