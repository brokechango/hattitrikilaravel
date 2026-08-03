<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

final class SecurityHeaders
{
    public function handle(Request $request, Closure $next): Response
    {
        /** @var Response $response */
        $response = $next($request);
        $viteOrigin = $this->viteDevelopmentOrigin();
        $scriptSources = trim("'self' {$viteOrigin}");
        $styleSources = trim("'self'".($viteOrigin === '' ? '' : " 'unsafe-inline' {$viteOrigin}"));
        $connectSources = trim(
            "'self' https://*.supabase.co wss://*.supabase.co".
            ($viteOrigin === '' ? '' : " {$viteOrigin} ws://localhost:5173 ws://127.0.0.1:5173"),
        );

        $response->headers->set('Content-Security-Policy', implode('; ', [
            "default-src 'self'",
            "base-uri 'none'",
            "object-src 'none'",
            "frame-ancestors 'none'",
            "form-action 'self'",
            "script-src {$scriptSources}",
            "style-src {$styleSources}",
            "img-src 'self' data: blob: https://*.supabase.co",
            "font-src 'self' data:",
            "connect-src {$connectSources}",
            "worker-src 'self' blob:",
            "manifest-src 'self'",
            "media-src 'self'",
        ]));
        $response->headers->set('Cross-Origin-Opener-Policy', 'same-origin');
        $response->headers->set('Cross-Origin-Resource-Policy', 'same-origin');
        $response->headers->set('Origin-Agent-Cluster', '?1');
        $response->headers->set(
            'Permissions-Policy',
            'accelerometer=(), ambient-light-sensor=(), autoplay=(), battery=(), '.
            'camera=(), display-capture=(), geolocation=(), gyroscope=(), '.
            'magnetometer=(), microphone=(), payment=(), usb=()'
        );
        $response->headers->set('Referrer-Policy', 'no-referrer');
        $response->headers->set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
        $response->headers->set('X-Content-Type-Options', 'nosniff');
        $response->headers->set('X-Frame-Options', 'DENY');
        $response->headers->set('X-Permitted-Cross-Domain-Policies', 'none');

        return $response;
    }

    private function viteDevelopmentOrigin(): string
    {
        $hotFile = public_path('hot');
        if (! is_file($hotFile)) {
            return '';
        }

        $origin = trim((string) file_get_contents($hotFile));

        return preg_match('#^https?://(?:localhost|127\.0\.0\.1):\d+$#', $origin) === 1
            ? $origin
            : '';
    }
}
