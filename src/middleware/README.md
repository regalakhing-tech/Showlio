# Middleware

Shared request guards. `rate_limit.php` counts sign-in and account-email attempts in Supabase (`private.auth_attempts`) and stops the request with 429 and `Retry-After`. It fails closed with 503 if the limit cannot be checked. Input validation lives in `../helpers/validation.php`.
