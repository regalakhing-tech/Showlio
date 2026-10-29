<?php

declare(strict_types=1);

// Read process environment only. Never return this entire array from an API.
return [
    'name' => 'Showlio',
    'environment' => getenv('APP_ENV') ?: 'production',
    'url' => getenv('APP_URL') ?: 'http://127.0.0.1:8000',
];
