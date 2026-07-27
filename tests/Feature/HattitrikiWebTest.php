<?php

declare(strict_types=1);

namespace Tests\Feature;

use Tests\TestCase;

final class HattitrikiWebTest extends TestCase
{
    public function test_www_host_redirects_to_the_canonical_domain(): void
    {
        config()->set('app.canonical_url', 'https://hattitrikifc.pro');

        $this->get('https://www.hattitrikifc.pro/partidos?temporada=3')
            ->assertPermanentRedirect('https://hattitrikifc.pro/partidos?temporada=3');
    }

    public function test_canonical_host_serves_the_application_without_redirecting(): void
    {
        config()->set('app.canonical_url', 'https://hattitrikifc.pro');

        $this->get('https://hattitrikifc.pro/')
            ->assertOk()
            ->assertSee('HATTITRIKI FC');
    }

    public function test_application_shell_is_served_in_spanish(): void
    {
        $this->get('/')
            ->assertOk()
            ->assertSee('<html lang="es">', false)
            ->assertSee('HATTITRIKI FC')
            ->assertSee('Acceso a Hattitriki')
            ->assertSee('auth-stage--loading', false)
            ->assertSee('bouncing-ball-loader', false)
            ->assertSee('⚽')
            ->assertSee('/boot-guard.js', false)
            ->assertSee('/config.js', false)
            ->assertSee('/hattitriki-app-icon.png', false);
    }

    public function test_client_side_routes_receive_the_application_shell(): void
    {
        foreach ([
            '/inicio',
            '/partidos',
            '/partidos/616263',
            '/rankings',
            '/rankings/jugador/616263',
            '/perfil',
            '/mister/partidos/nuevo',
        ] as $route) {
            $this->get($route)
                ->assertOk()
                ->assertSee('Hattitriki FC · Liga de fútbol amistosa');
        }
    }

    public function test_unknown_routes_and_invalid_identifiers_return_not_found(): void
    {
        $this->get('/ruta-que-no-existe')->assertNotFound();
        $this->get('/partidos/no-es-hexadecimal')->assertNotFound();
        $this->get('/mister/jugadores/no-es-hexadecimal')->assertNotFound();
    }

    public function test_security_headers_match_the_private_application_contract(): void
    {
        $response = $this->get('/');

        $response
            ->assertHeader('X-Content-Type-Options', 'nosniff')
            ->assertHeader('X-Frame-Options', 'DENY')
            ->assertHeader('Referrer-Policy', 'no-referrer')
            ->assertHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains')
            ->assertHeader('Cross-Origin-Opener-Policy', 'same-origin')
            ->assertHeader('Cross-Origin-Resource-Policy', 'same-origin');

        $contentSecurityPolicy = (string) $response->headers->get('Content-Security-Policy');

        $this->assertStringContainsString("default-src 'self'", $contentSecurityPolicy);
        $this->assertStringContainsString("connect-src 'self' https://*.supabase.co wss://*.supabase.co", $contentSecurityPolicy);
        $this->assertStringContainsString("frame-ancestors 'none'", $contentSecurityPolicy);
    }

    public function test_runtime_configuration_and_crest_are_available(): void
    {
        $configurationPath = public_path('config.js');
        $bootGuardPath = public_path('boot-guard.js');
        $crestPath = public_path('hattitriki-app-icon.png');

        $this->assertFileExists($configurationPath);
        $this->assertFileExists($bootGuardPath);
        $this->assertFileExists($crestPath);
        $this->assertStringContainsString(
            'HATTITRIKI_CONFIG',
            (string) file_get_contents($configurationPath),
        );
        $this->assertStringContainsString(
            'data-boot-loader',
            (string) file_get_contents($bootGuardPath),
        );
        $this->assertGreaterThan(100_000, filesize($crestPath));
    }
}
