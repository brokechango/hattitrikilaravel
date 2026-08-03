@php
    $latest = $matches[0] ?? null;
    $totalGoals = array_sum(array_map(fn ($match) => $match['teamAScore'] + $match['teamBScore'], $matches));
    $topScorer = $statistics->ranking('top-scorer', $stats, count($matches))[0] ?? null;
    $mostWins = $statistics->ranking('most-wins', $stats, count($matches))[0] ?? null;
    $onForm = $statistics->ranking('player-on-form', $stats, count($matches))[0] ?? null;
@endphp

<section class="page home-page">
    <header class="page-header">
        <div class="page-header__copy"><span class="page-kicker">HATTITRIKI · LIGA GENUINE</span><h1 class="page-title">Liga Genuine</h1><p class="page-subtitle">Resultados, rachas y campeones de la temporada.</p></div>
        @if (count($seasons) > 1)
            <label class="season-switcher"><span>Temporada</span><select class="select" wire:change="selectSeason($event.target.value)">@foreach ($seasons as $season)<option value="{{ $season['id'] }}" @selected($selectedSeasonId === $season['id'])>{{ $season['name'] }}</option>@endforeach</select></label>
        @endif
    </header>

    @if ($latest)
        <a class="card card--highlight card--clickable hero-score" href="/partidos/{{ $statistics->toHex($latest['id']) }}" wire:navigate data-motion-key="latest-match">
            <span class="hero-score__eyebrow">ÚLTIMO PARTIDO · {{ \Illuminate\Support\Carbon::parse($latest['playedOn'])->translatedFormat('j M Y') }}</span>
            <span class="scoreboard__main"><span class="scoreboard__team"><i class="team-mark">A</i><strong>Equipo A</strong></span><span class="scoreboard__score"><strong>{{ $latest['teamAScore'] }} : {{ $latest['teamBScore'] }}</strong>@if ($latest['teamAPenaltyScore'] !== null)<small>({{ $latest['teamAPenaltyScore'] }} - {{ $latest['teamBPenaltyScore'] }}) pen.</small>@endif</span><span class="scoreboard__team"><strong>Equipo B</strong><i class="team-mark team-mark--gold">B</i></span></span>
            <span class="hero-score__link">Ver acta completa <span aria-hidden="true">›</span></span>
        </a>
    @else
        <div class="card empty-state"><div><div class="state-icon">⚽</div><h2 class="state-title">Aún no hay partidos</h2><p class="state-copy">La temporada empezará a cobrar vida con la primera acta.</p></div></div>
    @endif

    <section class="stats-grid" aria-label="Resumen de temporada">
        <article class="card stat-card"><span>Partidos</span><strong data-motion-number="{{ count($matches) }}">{{ count($matches) }}</strong><small>registrados</small></article>
        <article class="card stat-card"><span>Goles</span><strong data-motion-number="{{ $totalGoals }}">{{ $totalGoals }}</strong><small>en total</small></article>
        <article class="card stat-card"><span>Jugadores</span><strong data-motion-number="{{ count($players) }}">{{ count($players) }}</strong><small>en la liga</small></article>
    </section>

    <header class="section-header"><div><span>CLASIFICACIONES</span><h2 class="section-heading">Protagonistas</h2></div><a href="/rankings" wire:navigate>Ver todos ›</a></header>
    <section class="feature-grid">
        @foreach ([['⚽', 'Máximo goleador', $topScorer, 'goals', 'goles'], ['🏆', 'Más victorias', $mostWins, 'wins', 'victorias'], ['🔥', 'Jugador en racha', $onForm, 'formScore', 'puntos']] as [$symbol, $label, $item, $field, $unit])
            <article class="card feature-card">
                <span class="feature-card__symbol" aria-hidden="true">{{ $symbol }}</span><small>{{ $label }}</small>
                @if ($item)<strong>{{ $item['player']['name'] }}</strong><span>{{ $field === 'formScore' ? floor($item[$field]) : $item[$field] }} {{ $unit }}</span>@else<strong>—</strong><span>Sin datos</span>@endif
            </article>
        @endforeach
    </section>
</section>
