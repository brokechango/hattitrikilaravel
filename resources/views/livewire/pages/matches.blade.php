@php
    $query = mb_strtolower(trim($historySearch));
    $visibleMatches = array_values(array_filter($matches, function ($match) use ($query, $playersById, $historyFrom, $historyTo) {
        if ($historyFrom !== '' && $match['playedOn'] < $historyFrom) return false;
        if ($historyTo !== '' && $match['playedOn'] > $historyTo) return false;
        if ($query === '') return true;
        if (str_contains($match['playedOn'], $query)) return true;
        foreach ($match['participants'] as $participant) if (str_contains(mb_strtolower($playersById[$participant['player_id']]['name'] ?? ''), $query)) return true;
        return false;
    }));
@endphp

<section class="page matches-page">
    <header class="page-header"><div class="page-header__copy"><span class="page-kicker">HISTÓRICO</span><h1 class="page-title">Partidos</h1><p class="page-subtitle">Resultados y actas de la temporada.</p></div></header>
    <section class="card filter-card">
        <label class="field"><span>Buscar</span><input class="input" type="search" wire:model.live.debounce.300ms="historySearch" placeholder="Fecha o jugador"></label>
        <label class="field"><span>Desde</span><input class="input" type="date" wire:model.live="historyFrom"></label>
        <label class="field"><span>Hasta</span><input class="input" type="date" wire:model.live="historyTo"></label>
        @if (count($seasons) > 1)<label class="field"><span>Temporada</span><select class="select" wire:change="selectSeason($event.target.value)">@foreach($seasons as $season)<option value="{{ $season['id'] }}" @selected($selectedSeasonId === $season['id'])>{{ $season['name'] }} · {{ $season['matchCount'] }} PJ</option>@endforeach</select></label>@endif
    </section>
    <div class="match-list">
        @forelse ($visibleMatches as $match)
            <a class="card card--clickable match-row" href="/partidos/{{ $statistics->toHex($match['id']) }}" wire:navigate>
                <span class="match-row__date"><strong>{{ \Illuminate\Support\Carbon::parse($match['playedOn'])->translatedFormat('j M') }}</strong><small>{{ \Illuminate\Support\Carbon::parse($match['playedOn'])->format('Y') }}</small></span>
                <span class="match-row__teams"><span><i class="team-mark">A</i> Equipo A</span><span><i class="team-mark team-mark--gold">B</i> Equipo B</span></span>
                <strong class="match-row__score">{{ $match['teamAScore'] }} – {{ $match['teamBScore'] }} @if ($match['teamAPenaltyScore'] !== null)<small>({{ $match['teamAPenaltyScore'] }}-{{ $match['teamBPenaltyScore'] }})</small>@endif</strong>
                <span aria-hidden="true">›</span>
            </a>
        @empty
            <div class="card empty-state"><div><div class="state-icon">⚽</div><h2 class="state-title">No hay partidos</h2><p class="state-copy">Prueba otra búsqueda o temporada.</p></div></div>
        @endforelse
    </div>
</section>
