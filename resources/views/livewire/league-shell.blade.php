@php
    $isAdmin = $role === 'admin';
    $activeTab = str_starts_with($routeName, 'matches.') ? 'matches'
        : (str_starts_with($routeName, 'rankings.') ? 'rankings'
        : ($routeName === 'profile' ? 'profile'
        : (str_starts_with($routeName, 'manager.') ? 'manager' : 'home')));
    $navigation = [
        ['/inicio', 'home', 'Inicio', '⌂'],
        ['/partidos', 'matches', 'Partidos', '▣'],
        ['/rankings', 'rankings', 'Rankings', '♜'],
        ['/perfil', 'profile', 'Perfil', '●'],
    ];
    if ($isAdmin) $navigation[] = ['/mister', 'manager', 'Míster', '⚙'];
@endphp

<div class="app-shell" data-livewire-league-shell>
    <header class="topbar">
        <div class="topbar__inner">
            <a class="topbar__brand" href="/inicio" wire:navigate>
                <img src="/hattitriki-app-icon.png" alt="Escudo de Hattitriki">
                <span class="topbar__brand-copy"><strong>HATTITRIKI FC</strong><small>LIGA GENUINE</small></span>
            </a>
            <nav class="topbar__desktop-nav" aria-label="Navegación principal">
                @foreach ($navigation as [$path, $tab, $label, $symbol])
                    <a class="nav-link" href="{{ $path }}" wire:navigate @if ($activeTab === $tab) aria-current="page" @endif>
                        <span class="nav-indicator"><span class="nav-icon" aria-hidden="true">{{ $symbol }}</span></span>
                        <span class="nav-label">{{ $label }}</span>
                    </a>
                @endforeach
            </nav>
            <span class="topbar__spacer"></span>
            <button class="topbar__menu" type="button" wire:click="logout" wire:confirm="¿Cerrar la sesión?">Cerrar sesión</button>
        </div>
    </header>

    <div class="shell-body">
        <nav class="nav-rail" aria-label="Navegación principal">
            @foreach ($navigation as [$path, $tab, $label, $symbol])
                <a class="nav-link" href="{{ $path }}" wire:navigate @if ($activeTab === $tab) aria-current="page" @endif>
                    <span class="nav-indicator"><span class="nav-icon" aria-hidden="true">{{ $symbol }}</span></span>
                    <span class="nav-label">{{ $label }}</span>
                </a>
            @endforeach
        </nav>

        <main id="main-content" class="main-content" tabindex="-1">
            @if ($statusMessage !== '')
                <div class="snackbar" role="status">{{ $statusMessage }}</div>
            @endif

            @if ($loadError !== '')
                <section class="page">
                    <header class="page-header"><div class="page-header__copy"><h1 class="page-title">Hattitriki FC</h1></div></header>
                    <div class="card error-state"><div><div class="state-icon">!</div><h2 class="state-title">No se han podido cargar los datos</h2><p class="state-copy">{{ $loadError }}</p><button class="btn" wire:click="refreshLeague">Reintentar</button></div></div>
                </section>
            @else
                @switch($routeName)
                    @case('home') @case('app')
                        @include('livewire.pages.home')
                        @break
                    @case('matches.index')
                        @include('livewire.pages.matches')
                        @break
                    @case('matches.show')
                        @include('livewire.pages.match-detail')
                        @break
                    @case('rankings.index')
                        @include('livewire.pages.rankings')
                        @break
                    @case('rankings.player') @case('profile')
                        @include('livewire.pages.profile')
                        @break
                    @case('manager.index')
                        @include('livewire.pages.manager')
                        @break
                    @case('manager.players.index')
                        @include('livewire.pages.manager-players')
                        @break
                    @case('manager.players.create') @case('manager.players.edit')
                        @include('livewire.pages.manager-player-form')
                        @break
                    @case('manager.matches.index')
                        @include('livewire.pages.manager-matches')
                        @break
                    @case('manager.matches.create') @case('manager.matches.edit')
                        @include('livewire.pages.manager-match-form')
                        @break
                    @case('manager.invitation')
                        @include('livewire.pages.manager-invitation')
                        @break
                    @case('manager.teams.index') @case('manager.teams.result')
                        @include('livewire.pages.manager-teams')
                        @break
                    @default
                        <section class="page"><div class="card error-state"><div><h1 class="state-title">Página no encontrada</h1><a class="btn" href="/inicio" wire:navigate>Volver al inicio</a></div></div></section>
                @endswitch
            @endif
        </main>
    </div>

    <nav class="bottom-nav" aria-label="Navegación principal">
        @foreach ($navigation as [$path, $tab, $label, $symbol])
            <a class="nav-link" href="{{ $path }}" wire:navigate @if ($activeTab === $tab) aria-current="page" @endif>
                <span class="nav-indicator"><span class="nav-icon" aria-hidden="true">{{ $symbol }}</span></span>
                <span class="nav-label">{{ $label }}</span>
            </a>
        @endforeach
    </nav>
</div>
