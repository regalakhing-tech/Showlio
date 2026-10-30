<?php

declare(strict_types=1);

// Composer packages (PHPMailer). Run `composer install` after cloning; Vercel's PHP runtime installs them itself.
if (is_file(dirname(__DIR__) . '/vendor/autoload.php')) {
    require_once dirname(__DIR__) . '/vendor/autoload.php';
}
require_once __DIR__ . '/helpers/env.php';
require_once __DIR__ . '/helpers/http.php';
require_once __DIR__ . '/helpers/session.php';
require_once __DIR__ . '/helpers/validation.php';
require_once __DIR__ . '/services/supabase.php';
require_once __DIR__ . '/services/mailer.php';
require_once __DIR__ . '/middleware/rate_limit.php';
require_once __DIR__ . '/controllers/HealthController.php';
require_once __DIR__ . '/controllers/AuthController.php';
require_once __DIR__ . '/controllers/ProfileController.php';
require_once __DIR__ . '/controllers/CommunityController.php';

load_env_file(dirname(__DIR__) . '/.env');

$app = require __DIR__ . '/config/app.php';
