<?php

declare(strict_types=1);

namespace App\Livewire;

use App\Services\Supabase\SupabaseSession;
use Illuminate\Contracts\View\View;
use Livewire\Attributes\Locked;
use Livewire\Component;

final class AppShell extends Component
{
    #[Locked]
    public string $routeName = 'app';

    #[Locked]
    public string $routePath = '/';

    #[Locked]
    public ?string $resourceId = null;

    #[Locked]
    public bool $authenticated = false;

    #[Locked]
    public ?string $authFlow = null;

    public function mount(
        SupabaseSession $session,
        ?string $match = null,
        ?string $player = null,
    ): void {
        $route = request()->route();
        $routeName = $route?->getName();

        $this->routeName = is_string($routeName) ? $routeName : 'app';
        $this->routePath = '/'.ltrim(request()->path(), '/');
        $this->resourceId = $match ?? $player;
        $requestedFlow = request()->query('auth_flow');
        $this->authFlow = is_string($requestedFlow) && in_array($requestedFlow, ['invite', 'recovery'], true)
            ? $requestedFlow
            : null;
        $this->authenticated = $session->check();
    }

    public function render(): View
    {
        return view('livewire.app-shell');
    }
}
