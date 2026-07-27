<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

final class RedirectToCanonicalHost
{
    public function handle(Request $request, Closure $next): Response
    {
        $canonicalUrl = rtrim((string) config('app.canonical_url'), '/');
        $canonicalHost = parse_url($canonicalUrl, PHP_URL_HOST);

        if (
            ! is_string($canonicalHost)
            || strtolower($request->getHost()) !== 'www.'.strtolower($canonicalHost)
        ) {
            return $next($request);
        }

        $canonicalScheme = parse_url($canonicalUrl, PHP_URL_SCHEME);
        $scheme = is_string($canonicalScheme) ? $canonicalScheme : $request->getScheme();

        return redirect()->away(
            $scheme.'://'.$canonicalHost.$request->getRequestUri(),
            Response::HTTP_PERMANENTLY_REDIRECT,
        );
    }
}
