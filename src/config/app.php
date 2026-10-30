<?php

declare(strict_types=1);

// Read process environment only. Never return this entire array from an API.
return [
    'name' => 'Showlio',
    'environment' => getenv('APP_ENV') ?: 'production',
    'url' => getenv('APP_URL') ?: 'http://127.0.0.1:8000',
    'supabase' => [
        'url' => getenv('SUPABASE_URL') ?: '',
        'publishable_key' => getenv('SUPABASE_PUBLISHABLE_KEY') ?: (getenv('SUPABASE_ANON_KEY') ?: ''),
        // Server-only: rate limits, issuing email codes and passing visitor IPs to Supabase Auth.
        // Data access uses the caller's token and RLS.
        'secret_key' => getenv('SUPABASE_SECRET_KEY') ?: '',
    ],
    // Code emails (sign-up, resend, password reset) go out over SMTP with PHPMailer.
    'mail' => [
        'host' => getenv('SMTP_HOST') ?: '',
        'port' => (int) (getenv('SMTP_PORT') ?: 587),
        'username' => getenv('SMTP_USERNAME') ?: '',
        'password' => getenv('SMTP_PASSWORD') ?: '',
        'secure' => getenv('SMTP_SECURE') ?: 'tls', // tls (STARTTLS, port 587), ssl (port 465) or none
        'from' => getenv('MAIL_FROM') ?: (getenv('SMTP_USERNAME') ?: ''),
        'from_name' => getenv('MAIL_FROM_NAME') ?: 'Showlio',
        // Links and the logo in emails point here, so they work even when testing locally.
        'site_url' => getenv('SITE_URL') ?: 'https://showlio-seven.vercel.app',
    ],
];
