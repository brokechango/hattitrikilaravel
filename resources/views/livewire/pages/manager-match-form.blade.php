<section class="page admin-page manager-page">
    <header class="page-header"><div class="page-header__copy"><span class="page-kicker">ACTA DE PARTIDO</span><h1 class="page-title">{{ $editingMatchId ? 'Editar partido' : 'Nuevo partido' }}</h1><p class="page-subtitle">Marcador, convocatoria, porteros y goleadores en una sola acta.</p></div><a class="btn btn--outline" href="/mister/partidos" wire:navigate>Volver</a></header>
    @if ($role !== 'admin')
        <div class="card error-state"><div><h2 class="state-title">Acceso restringido</h2></div></div>
    @else
        <form class="manager-form" wire:submit="saveMatch" data-unsaved-guard>
            <section class="card manager-form__main">
                <header class="manager-form__header"><span class="manager-form__icon">▣</span><div><span>01 · RESULTADO</span><h2>Datos básicos</h2></div></header>
                <div class="form-grid">
                    <label class="manager-field field--span"><span>Fecha <b>*</b></span><input class="input" type="date" wire:model="matchDate">@error('matchDate')<em class="field-error">{{ $message }}</em>@enderror</label>
                    <label class="manager-field"><span>Equipo A <b>*</b></span><input class="input" type="number" min="0" max="99" wire:model="scoreA"></label>
                    <label class="manager-field"><span>Equipo B <b>*</b></span><input class="input" type="number" min="0" max="99" wire:model="scoreB"></label>
                    <label class="manager-switch-row field--span"><span><strong>Tanda de penaltis</strong><small>Solo disponible si el resultado termina en empate.</small></span><span class="switch"><input type="checkbox" wire:model.live="hasPenalties"><span class="switch__track"></span></span></label>
                    @if ($hasPenalties)
                        <label class="manager-field"><span>Penaltis A</span><input class="input" type="number" min="0" max="99" wire:model="penaltyA"></label><label class="manager-field"><span>Penaltis B</span><input class="input" type="number" min="0" max="99" wire:model="penaltyB"></label>
                    @endif
                    @error('penaltyA')<em class="field-error field--span">{{ $message }}</em>@enderror
                </div>
            </section>

            <section class="card manager-form__main">
                <header class="manager-form__header"><span class="manager-form__icon">●</span><div><span>02 · ALINEACIONES</span><h2>Equipos y porteros</h2></div></header>
                <div class="selection-grid">
                    @foreach ($activePlayers as $player)
                        <article class="select-player" wire:key="lineup-{{ $player['id'] }}"><strong class="ranking-name">{{ $player['name'] }}</strong>
                            <label><input type="checkbox" value="{{ $player['id'] }}" wire:model.live="teamA"> Equipo A</label>
                            @if (in_array($player['id'], $teamA, true))<label><input type="checkbox" value="{{ $player['id'] }}" wire:model="goalkeepersA"> Portero A</label>@endif
                            <label><input type="checkbox" value="{{ $player['id'] }}" wire:model.live="teamB"> Equipo B</label>
                            @if (in_array($player['id'], $teamB, true))<label><input type="checkbox" value="{{ $player['id'] }}" wire:model="goalkeepersB"> Portero B</label>@endif
                        </article>
                    @endforeach
                </div>
                @error('teamA')<em class="field-error">{{ $message }}</em>@enderror @error('teamB')<em class="field-error">{{ $message }}</em>@enderror
            </section>

            <section class="card manager-form__main">
                <header class="manager-form__header"><span class="manager-form__icon">⚽</span><div><span>03 · GOLES</span><h2>Autoría del marcador</h2></div></header>
                <div class="goal-editor">
                    @foreach ($goals as $index => $goal)
                        <div class="form-grid" wire:key="goal-{{ $index }}">
                            <label class="manager-field"><span>Jugador</span><select class="select" wire:model="goals.{{ $index }}.player_id"><option value="">Sin asignar</option>@foreach ($activePlayers as $player)<option value="{{ $player['id'] }}">{{ $player['name'] }}</option>@endforeach</select></label>
                            <label class="manager-field"><span>Equipo</span><select class="select" wire:model="goals.{{ $index }}.team"><option value="A">A</option><option value="B">B</option></select></label>
                            <label class="manager-field"><span>Cantidad</span><input class="input" type="number" min="1" max="99" wire:model="goals.{{ $index }}.count"></label>
                            <label class="manager-switch-row"><span><strong>Gol en propia</strong></span><span class="switch"><input type="checkbox" wire:model="goals.{{ $index }}.is_own_goal"><span class="switch__track"></span></span></label>
                            <button class="btn btn--text" type="button" wire:click="removeGoal({{ $index }})">Quitar</button>
                        </div>
                    @endforeach
                </div>
                @error('goals')<em class="field-error">{{ $message }}</em>@enderror
                <button class="btn btn--outline" type="button" wire:click="addGoal">＋ Añadir goleador</button>
            </section>
            <div class="manager-form__actions"><a class="btn btn--text" href="/mister/partidos" wire:navigate>Cancelar</a><button class="btn" type="submit" wire:loading.attr="disabled">Guardar acta</button></div>
        </form>
    @endif
</section>
