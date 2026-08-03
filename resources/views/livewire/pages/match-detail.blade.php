<section class="page match-detail-page">
    @if (! $selectedMatch)
        <header class="page-header"><div class="page-header__copy"><h1 class="page-title">Acta del partido</h1></div></header><div class="card error-state"><div><div class="state-icon">!</div><h2 class="state-title">Partido no encontrado</h2><a class="btn" href="/partidos" wire:navigate>Volver</a></div></div>
    @else
        @php
            $match = $selectedMatch;
            $goals = $statistics->aggregateGoals($match['goals'], $match['participants']);
            $participantIds = array_values(array_unique(array_column($match['participants'], 'player_id')));
            $currentVote = collect($mvpVotes)->first(fn($vote) => ($vote['match_id'] ?? null) === $match['id'] && ($vote['is_current_vote'] ?? false));
            $votingEnabled = !in_array($match['id'], $mvpDisabledMatchIds, true);
            $eligible = $votingEnabled && $currentPlayerId && in_array($currentPlayerId, $participantIds, true);
        @endphp
        <header class="page-header"><div class="page-header__copy"><span class="page-kicker">ACTA DEL PARTIDO</span><h1 class="page-title">{{ \Illuminate\Support\Carbon::parse($match['playedOn'])->translatedFormat('j F Y') }}</h1><p class="page-subtitle">Resultado, alineaciones y goleadores.</p></div></header>
        <div class="match-detail-grid">
            <section class="card card--highlight scoreboard match-scoreboard">
                <div class="match-scoreboard__meta"><span class="match-scoreboard__status"><i></i> Finalizado</span><span>{{ count($participantIds) }} jugadores</span></div>
                <div class="scoreboard__main"><span class="scoreboard__team"><i class="team-mark">A</i><span><small>Equipo</small><b>A</b></span></span><span class="scoreboard__score"><small>Resultado</small><strong>{{ $match['teamAScore'] }} : {{ $match['teamBScore'] }}</strong>@if($match['teamAPenaltyScore'] !== null)<b>({{ $match['teamAPenaltyScore'] }} - {{ $match['teamBPenaltyScore'] }})</b>@endif</span><span class="scoreboard__team"><span><small>Equipo</small><b>B</b></span><i class="team-mark team-mark--gold">B</i></span></div>
            </section>
            <section class="match-detail-section"><header class="match-detail-section__header"><div><span>PLANTILLAS</span><h2 class="section-heading">Alineaciones</h2></div></header><div class="team-grid">
                @foreach (['A','B'] as $team)
                    @php $participants = array_values(array_filter($match['participants'], fn($participant) => $participant['team'] === $team)); @endphp
                    <section class="card team-card team-card--{{ mb_strtolower($team) }}"><header class="team-card__heading"><i class="team-mark{{ $team === 'B' ? ' team-mark--gold' : '' }}">{{ $team }}</i><span><small>EQUIPO</small><strong>Equipo {{ $team }}</strong></span><b>{{ count($participants) }}</b></header><div class="team-card__players">@foreach($participants as $participant) @php $player=$playersById[$participant['player_id']] ?? ['name'=>'Jugador']; @endphp <a class="player-line card--clickable" href="/rankings/jugador/{{ $statistics->toHex($participant['player_id']) }}" wire:navigate><span class="avatar">{{ mb_strtoupper(mb_substr($player['name'],0,2)) }}</span><span class="player-line__copy"><strong>{{ $player['name'] }}</strong><small>{{ $participant['was_goalkeeper'] ? 'Portero' : 'Jugador' }}</small></span>@if($participant['was_goalkeeper'])<span title="Portero">🧤</span>@endif<span aria-hidden="true">›</span></a>@endforeach</div></section>
                @endforeach
            </div></section>
            <section class="match-detail-section"><header class="match-detail-section__header"><div><span>CRONOLOGÍA</span><h2 class="section-heading">Goles</h2></div><strong>{{ array_sum(array_column($goals,'count')) }} en total</strong></header><div class="goals-card">@forelse($goals as $goal)<a class="goal-entry goal-entry--{{ mb_strtolower($goal['team']) }}{{ ($goal['is_own_goal'] ?? false) ? ' goal-entry--own' : '' }}" href="/rankings/jugador/{{ $statistics->toHex($goal['player_id']) }}" wire:navigate><span class="goal-entry__icon">{{ ($goal['is_own_goal'] ?? false) ? 'PP' : '⚽' }}</span><span class="goal-entry__copy"><small>EQUIPO {{ $goal['team'] }}</small><strong>{{ $playersById[$goal['player_id']]['name'] ?? 'Jugador' }}</strong></span><strong class="goal-entry__count">×{{ $goal['count'] }}</strong></a>@empty<p class="goals-card__empty">No se registraron goleadores.</p>@endforelse</div></section>
            <section class="card match-mvp"><div class="match-mvp__intro"><span class="match-mvp__symbol">★</span><div class="match-mvp__copy"><span>VOTACIÓN DEL PARTIDO</span><h2>¿Quién fue el MVP?</h2><p>{{ !$votingEnabled ? 'La votación no está disponible para este partido.' : ($eligible ? 'Elige a otro jugador como el más destacado.' : 'Solo los participantes pueden votar.') }}</p></div>@if($currentVote)<span class="match-mvp__current">Tu voto: <strong>{{ $playersById[$currentVote['nominee_player_id']]['name'] ?? 'Jugador' }}</strong></span>@endif</div>
                @if($eligible)<div class="mvp-candidate-grid">@foreach($participantIds as $playerId) @continue($playerId === $currentPlayerId) <button class="mvp-candidate" type="button" wire:click="castMvpVote('{{ $match['id'] }}','{{ $playerId }}')"><span class="avatar">{{ mb_strtoupper(mb_substr($playersById[$playerId]['name'] ?? 'J',0,2)) }}</span><span class="mvp-candidate__copy"><strong>{{ $playersById[$playerId]['name'] ?? 'Jugador' }}</strong></span><span aria-hidden="true">›</span></button>@endforeach</div>@endif
            </section>
        </div>
    @endif
</section>
