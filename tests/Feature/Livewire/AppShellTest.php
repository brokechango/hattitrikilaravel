<?php

declare(strict_types=1);

namespace Tests\Feature\Livewire;

use App\Livewire\AppShell;
use Livewire\Features\SupportLockedProperties\CannotUpdateLockedPropertyException;
use Livewire\Livewire;
use Tests\TestCase;

final class AppShellTest extends TestCase
{
    public function test_component_exposes_a_locked_route_contract_and_livewire_auth(): void
    {
        $this->assertTrue((bool) config('livewire.csp_safe'));

        Livewire::test(AppShell::class)
            ->assertSet('routeName', 'app')
            ->assertSet('routePath', fn (string $routePath): bool => str_starts_with($routePath, '/'))
            ->assertSet('resourceId', null)
            ->assertSeeHtml('data-livewire-host="app-shell"')
            ->assertDontSeeHtml('wire:ignore')
            ->assertSee('ÁREA DE MIEMBROS')
            ->assertSee('HATTITRIKI FC');
    }

    public function test_route_parameters_are_rendered_as_safe_host_metadata(): void
    {
        $this->get('/rankings/jugador/616263')
            ->assertOk()
            ->assertSee('data-route-name="rankings.player"', false)
            ->assertSee('data-route-path="/rankings/jugador/616263"', false)
            ->assertSee('data-route-resource="616263"', false);
    }

    public function test_client_cannot_mutate_server_route_metadata(): void
    {
        $this->expectException(CannotUpdateLockedPropertyException::class);

        Livewire::test(AppShell::class)->set('routeName', 'manager.index');
    }
}
