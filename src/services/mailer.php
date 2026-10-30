<?php

declare(strict_types=1);

use PHPMailer\PHPMailer\Exception as MailerException;
use PHPMailer\PHPMailer\PHPMailer;

// Sign-up, resend and password reset codes are sent by Showlio itself over SMTP
// (PHPMailer), not by Supabase, so Supabase's hourly email cap never blocks sign-ups.
// The emails use the templates in src/emails/, written in Supabase's template syntax.

const EMAIL_SUBJECTS = [
    'confirmation' => 'Your Showlio verification code',
    'recovery' => 'Your Showlio password reset code',
];

/**
 * Fills a template's {{ .Token }}, {{ .SiteURL }}, {{ .Email }}, {{ .Data.name }} and
 * {{ if .Data.name }}…{{ else }}…{{ end }} placeholders. Every value is HTML-escaped.
 * @param array{token: string, site_url: string, email: string, data: array<string, mixed>} $values
 */
function render_email(string $template, array $values): string
{
    $data = $values['data'];
    $html = (string) preg_replace_callback(
        '/\{\{ if \.Data\.(\w+) \}\}(.*?)(?:\{\{ else \}\}(.*?))?\{\{ end \}\}/s',
        static fn (array $match): string => trim((string) ($data[$match[1]] ?? '')) !== '' ? $match[2] : ($match[3] ?? ''),
        $template,
    );
    $escape = static fn (mixed $value): string => htmlspecialchars((string) $value, ENT_QUOTES | ENT_HTML5, 'UTF-8');

    return (string) preg_replace_callback('/\{\{ \.(Token|SiteURL|Email|Data\.(\w+)) \}\}/', static fn (array $match): string => match ($match[1]) {
        'Token' => $escape($values['token']),
        'SiteURL' => $escape(rtrim($values['site_url'], '/')),
        'Email' => $escape($values['email']),
        default => $escape($data[$match[2]] ?? ''),
    }, $html);
}

/**
 * Sends a code email ('confirmation' or 'recovery'). Returns false when it could not be sent.
 * @param array{host: string, port: int, username: string, password: string, secure: string, from: string, from_name: string, site_url: string} $mail
 * @param array<string, mixed> $data the user's metadata, e.g. full_name
 */
function send_code_email(array $mail, string $kind, string $to, string $code, array $data = []): bool
{
    if ($mail['host'] === '' || $mail['from'] === '' || !class_exists(PHPMailer::class)) {
        error_log('Email is not configured: set SMTP_HOST, SMTP_USERNAME, SMTP_PASSWORD and MAIL_FROM, and run composer install.');
        return false;
    }

    $template = (string) file_get_contents(dirname(__DIR__) . '/emails/' . $kind . '.html');
    $html = render_email($template, ['token' => $code, 'site_url' => $mail['site_url'], 'email' => $to, 'data' => $data]);
    $purpose = $kind === 'recovery' ? 'password reset code' : 'verification code';

    $mailer = new PHPMailer(true);
    try {
        $mailer->isSMTP();
        $mailer->Host = $mail['host'];
        $mailer->Port = $mail['port'];
        $mailer->SMTPAuth = $mail['username'] !== '';
        $mailer->Username = $mail['username'];
        $mailer->Password = $mail['password'];
        $mailer->SMTPSecure = match ($mail['secure']) {
            'ssl' => PHPMailer::ENCRYPTION_SMTPS,
            'tls' => PHPMailer::ENCRYPTION_STARTTLS,
            default => '',
        };
        $mailer->SMTPAutoTLS = $mail['secure'] !== 'none';
        $mailer->Timeout = 15;
        $mailer->CharSet = PHPMailer::CHARSET_UTF8;
        $mailer->setFrom($mail['from'], $mail['from_name']);
        $mailer->addAddress($to);
        // The code leads the subject, like most sign-in emails: Gmail then offers its own
        // Copy code button in the inbox and phone notification. Email can't run a copy button itself.
        $mailer->Subject = $code . ' is ' . lcfirst(EMAIL_SUBJECTS[$kind]);
        $mailer->isHTML(true);
        // The logo travels inside the email (cid:showlio-logo) rather than loading from the website.
        $mailer->addEmbeddedImage(dirname(__DIR__, 2) . '/public/assets/images/showlio-logo-sm.png', 'showlio-logo', 'showlio.png', PHPMailer::ENCODING_BASE64, 'image/png');
        $mailer->Body = $html;
        $mailer->AltBody = "Your Showlio {$purpose} is {$code}. It expires in 1 hour.\n\nIf you didn't ask for this, you can ignore this email.";
        $mailer->send();
        return true;
    } catch (MailerException) {
        error_log('Sending the ' . $kind . ' email failed: ' . $mailer->ErrorInfo);
        return false;
    }
}
