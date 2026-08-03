<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Livewire\AppShell;
use Illuminate\Routing\Route;
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
            ->assertSee('ÁREA DE MIEMBROS')
            ->assertSee('/boot-guard.js', false)
            ->assertDontSee('/config.js', false)
            ->assertSee('/hattitriki-app-icon.png', false)
            ->assertSee('data-livewire-host="app-shell"', false)
            ->assertDontSee('wire:ignore', false)
            ->assertSee('livewire.js?id=', false);
    }

    public function test_application_routes_are_hosted_by_the_livewire_shell(): void
    {
        foreach ([
            'app',
            'home',
            'matches.index',
            'matches.show',
            'rankings.index',
            'rankings.player',
            'profile',
            'manager.index',
            'manager.matches.index',
            'manager.matches.create',
            'manager.matches.edit',
            'manager.players.index',
            'manager.players.create',
            'manager.players.edit',
            'manager.invitation',
            'manager.teams.index',
            'manager.teams.result',
        ] as $routeName) {
            $route = app('router')->getRoutes()->getByName($routeName);

            $this->assertInstanceOf(Route::class, $route, "Missing route [{$routeName}].");
            $this->assertSame(AppShell::class, $route->getAction('livewire_component'));
        }
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
        $this->assertStringContainsString("connect-src 'self'", $contentSecurityPolicy);
        $this->assertStringNotContainsString('wss://*.supabase.co', $contentSecurityPolicy);
        $this->assertStringContainsString("frame-ancestors 'none'", $contentSecurityPolicy);

        $this->assertMatchesRegularExpression("/script-src 'self' 'nonce-[A-Za-z0-9]+'/", $contentSecurityPolicy);
        $this->assertMatchesRegularExpression("/style-src 'self' 'nonce-[A-Za-z0-9]+'/", $contentSecurityPolicy);
        preg_match("/'nonce-([^']+)'/", $contentSecurityPolicy, $nonceMatches);
        $this->assertNotEmpty($nonceMatches[1] ?? null);
        $response->assertSee('nonce="'.($nonceMatches[1] ?? '').'"', false);
    }

    public function test_runtime_assets_are_available_without_browser_supabase_configuration(): void
    {
        $configurationPath = public_path('config.js');
        $bootGuardPath = public_path('boot-guard.js');
        $crestPath = public_path('hattitriki-app-icon.png');

        $this->assertFileDoesNotExist($configurationPath);
        $this->assertFileExists($bootGuardPath);
        $this->assertFileExists($crestPath);
        $this->assertStringContainsString(
            'asset-recovery',
            (string) file_get_contents($bootGuardPath),
        );
        $this->assertGreaterThan(100_000, filesize($crestPath));
    }
}
