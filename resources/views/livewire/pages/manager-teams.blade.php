<section class="page admin-page manager-page">
    <header class="page-header"><div class="page-header__copy"><span class="page-kicker">HERRAMIENTAS</span><h1 class="page-title">Generador de equipos</h1><p class="page-subtitle">Reparte jugadores equilibrando forma, historial y cardio.</p></div><a class="btn btn--outline" href="/mister" wire:navigate>Volver</a></header>
    @if ($role !== 'admin')
        <div class="card error-state"><div><h2 class="state-title">Acceso restringido</h2></div></div>
    @else
        <section class="card manager-tool-panel">
            <header class="manager-section-heading"><div><span>01 · CONVOCATORIA</span><h2 class="section-heading">Selecciona jugadores</h2><p>{{ count($selectedPlayerIds) }} de {{ count($activePlayers) }} seleccionados</p></div><div class="manager-section-heading__actions"><button class="btn btn--text" type="button" wire:click="selectAllPlayers">Todos</button><button class="btn btn--text" type="button" wire:click="clearSelectedPlayers">Ninguno</button></div></header>
            <div class="selection-grid">@foreach ($activePlayers as $player)<label class="select-player {{ in_array($player['id'], $selectedPlayerIds, true) ? 'randomizer-player--selected' : '' }}" wire:key="randomizer-{{ $player['id'] }}"><input type="checkbox" value="{{ $player['id'] }}" wire:model.live="selectedPlayerIds"><strong class="ranking-name">{{ $player['name'] }}</strong><small>{{ ($player['has_cardio'] ?? false) ? '⚡ Buen cardio' : 'Perfil estándar' }}</small></label>@endforeach</div>
            @error('selectedPlayerIds')<em class="field-error">{{ $message }}</em>@enderror
        </section>
        <section class="card manager-tool-panel">
            <header class="manager-section-heading"><div><span>02 · EQUILIBRADO</span><h2 class="section-heading">Configura el sorteo</h2></div></header>
            <div class="form-grid"><label class="manager-field"><span>Número de equipos</span><select class="select" wire:model.live="teamCount">@for($count = 2; $count <= min(6, max(2, count($selectedPlayerIds))); $count++)<option value="{{ $count }}">{{ $count }}</option>@endfor</select></label><label class="manager-field"><span>Criterio</span><select class="select" wire:model.live="balanceMode"><option value="streak">Forma reciente</option><option value="historical">Rendimiento histórico</option></select></label></div>
            @error('balanceMode')<em class="field-error">{{ $message }}</em>@enderror
            <button class="btn" type="button" wire:click="generateTeams" wire:loading.attr="disabled">↝ Generar equipos</button>
        </section>
        @if ($generatedTeams !== [])
            @php
                $teamPointTotals = array_map(
                    static fn (array $team): float => array_sum(array_column($team, 'statsScore')),
                    $generatedTeams,
                );
                $pointDifference = max($teamPointTotals) - min($teamPointTotals);
                $criterionLabel = $balanceMode === 'historical' ? 'histórico' : 'racha reciente';
            @endphp
            <section class="manager-result-note"><h2>Reparto propuesto</h2><p>La diferencia entre el equipo con más y menos puntos de {{ $criterionLabel }} es de <strong>{{ number_format($pointDifference, 1, ',', '.') }}</strong>.</p></section>
            <div class="admin-grid">@foreach ($generatedTeams as $index => $team)<section class="card admin-section"><header class="admin-section__header"><span class="admin-section__number">{{ chr(65 + $index) }}</span><div><h2>Equipo {{ chr(65 + $index) }}</h2><p>{{ count($team) }} jugadores · {{ number_format($teamPointTotals[$index], 1, ',', '.') }} puntos</p></div></header><div class="admin-tools">@foreach ($team as $position => $player)<div class="admin-tool"><span class="admin-tool__icon">{{ str_pad((string) ($position + 1), 2, '0', STR_PAD_LEFT) }}</span><span class="admin-tool__copy"><strong>{{ $player['name'] }}</strong><small>{{ ($player['has_cardio'] ?? false) ? '⚡ Buen cardio' : 'Jugador' }} · {{ number_format((float) ($player['statsScore'] ?? 0), 1, ',', '.') }} pts</small></span></div>@endforeach</div></section>@endforeach</div>
            <div class="card randomizer-result-footer"><p>{{ count($generatedTeams) === 2 ? 'Puedes crear el acta directamente con este reparto.' : 'Para crear un acta se necesitan exactamente dos equipos.' }}</p><div class="manager-result-actions"><button class="btn btn--outline" type="button" wire:click="generateTeams">Repetir sorteo</button>@if(count($generatedTeams) === 2)<button class="btn" type="button" wire:click="createMatchFromTeams">Crear acta</button>@endif</div></div>
        @endif
    @endif
</section>
