@php
    $visiblePlayers = collect($adminPlayers)
        ->filter(fn (array $player) => $playerStatus === 'all' || ($playerStatus === 'active') === (bool) ($player['is_active'] ?? false))
        ->filter(fn (array $player) => $playerSearch === '' || str_contains(mb_strtolower((string) $player['name']), mb_strtolower($playerSearch)))
        ->values();
@endphp

<section class="page admin-page manager-page">
    <header class="page-header">
        <div class="page-header__copy"><span class="page-kicker">PLANTILLA</span><h1 class="page-title">Gestionar jugadores</h1><p class="page-subtitle">Altas, estado y datos deportivos de la plantilla.</p></div>
        <a class="btn" href="/mister/jugadores/nuevo" wire:navigate>＋ Añadir jugador</a>
    </header>

    @if ($role !== 'admin')
        <div class="card error-state"><div><h2 class="state-title">Acceso restringido</h2><a class="btn" href="/inicio" wire:navigate>Volver</a></div></div>
    @else
        <div class="card manager-filter">
            <label class="field"><span>Buscar</span><input class="input" type="search" wire:model.live.debounce.250ms="playerSearch" placeholder="Nombre del jugador"></label>
            <label class="field"><span>Estado</span><select class="select" wire:model.live="playerStatus"><option value="all">Todos</option><option value="active">Activos</option><option value="inactive">Inactivos</option></select></label>
        </div>
        <p class="manager-results-count"><strong>{{ $visiblePlayers->count() }}</strong> jugadores encontrados</p>
        <div class="card table-wrap manager-table">
            <table class="data-table">
                <thead><tr><th>Jugador</th><th>Cardio</th><th>Estado</th><th>Acciones</th></tr></thead>
                <tbody>
                    @forelse ($visiblePlayers as $player)
                        <tr wire:key="admin-player-{{ $player['id'] }}">
                            <td data-label="Jugador"><strong>{{ $player['name'] }}</strong></td>
                            <td data-label="Cardio">{{ ($player['has_cardio'] ?? false) ? '⚡ Sí' : 'No' }}</td>
                            <td data-label="Estado"><span class="status-badge {{ ($player['is_active'] ?? false) ? 'status-badge--success' : '' }}">{{ ($player['is_active'] ?? false) ? 'Activo' : 'Inactivo' }}</span></td>
                            <td data-label="Acciones"><div class="table-actions">
                                <a class="icon-btn" href="/mister/jugadores/{{ $statistics->toHex($player['id']) }}" wire:navigate aria-label="Editar a {{ $player['name'] }}">✎</a>
                                <button class="icon-btn" type="button" wire:click="setPlayerActive('{{ $player['id'] }}', {{ ($player['is_active'] ?? false) ? 'false' : 'true' }})" @if ($player['is_active'] ?? false) wire:confirm="El jugador conservará su historial, pero no aparecerá en nuevas convocatorias. ¿Continuar?" @endif>{{ ($player['is_active'] ?? false) ? '⊘' : '✓' }}</button>
                                <button class="icon-btn" type="button" wire:click="deletePlayer('{{ $player['id'] }}')" wire:confirm="Esta acción eliminará al jugador y no se puede deshacer. ¿Continuar?" aria-label="Eliminar a {{ $player['name'] }}">⌫</button>
                            </div></td>
                        </tr>
                    @empty
                        <tr><td colspan="4">No hay jugadores que coincidan con los filtros.</td></tr>
                    @endforelse
                </tbody>
            </table>
        </div>
    @endif
</section>
