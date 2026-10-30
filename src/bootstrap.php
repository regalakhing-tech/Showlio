<?php

declare(strict_types=1);

require_once __DIR__ . '/helpers/env.php';
require_once __DIR__ . '/helpers/http.php';
require_once __DIR__ . '/controllers/HealthController.php';

load_env_file(dirname(__DIR__) . '/.env');

$app = require __DIR__ . '/config/app.php';
