@php
    $categories = [
        'top-scorer' => ['⚽', 'Máximo goleador'],
        'goals-per-match' => ['🎯', 'Goles / partido'],
        'zamora' => ['🧤', 'Zamora'],
        'goals-conceded-per-match' => ['🛡', 'GC / partido'],
        'most-played' => ['👟', 'Más jugado'],
        'most-wins' => ['🏆', 'Más victorias'],
        'player-on-form' => ['🔥', 'En racha'],
        'people-favourite' => ['★', 'Preferido del pueblo'],
    ];
@endphp

<section class="page rankings-page">
    <header class="page-header"><div class="page-header__copy"><span class="page-kicker">CLASIFICACIONES</span><h1 class="page-title">Rankings</h1><p class="page-subtitle">Compara rendimiento, regularidad y forma reciente.</p></div></header>
    <div class="ranking-tabs" role="tablist" aria-label="Categorías de ranking">
        @foreach ($categories as $key => [$symbol, $label])
            <button class="ranking-tab{{ $rankingCategory === $key ? ' is-active' : '' }}" type="button" wire:click="setRankingCategory('{{ $key }}')" aria-selected="{{ $rankingCategory === $key ? 'true' : 'false' }}"><span aria-hidden="true">{{ $symbol }}</span>{{ $label }}</button>
        @endforeach
    </div>
    <div class="ranking-list">
        @forelse ($ranking as $index => $item)
            @php
                $value = match ($rankingCategory) {
                    'goals-per-match' => number_format($item['goalsPerMatch'], 1, ',', ''),
                    'zamora' => number_format((float) $item['goalsAgainst'], 1, ',', ''),
                    'goals-conceded-per-match' => number_format((float) $item['goalsAgainstPerMatch'], 1, ',', ''),
                    'most-played' => $item['matchesPlayed'],
                    'most-wins' => $item['wins'],
                    'player-on-form' => floor($item['formScore']),
                    'people-favourite' => $item['mvpVotes'],
                    default => $item['goals'],
                };
            @endphp
            <a class="ranking-row{{ $index < 3 ? ' ranking-row--podium' : '' }}" href="/rankings/jugador/{{ $statistics->toHex($item['player']['id']) }}" wire:navigate>
                <span class="ranking-row__position">{{ $index + 1 }}</span>
                <span class="avatar">@if(isset($avatars[$item['player']['id']]))<img src="{{ $avatars[$item['player']['id']] }}" alt="Foto de {{ $item['player']['name'] }}">@else{{ mb_strtoupper(mb_substr($item['player']['name'], 0, 2)) }}@endif</span>
                <span class="ranking-row__identity"><strong>{{ $item['player']['name'] }}</strong><small>{{ $item['matchesPlayed'] }} partidos · {{ $item['wins'] }} victorias</small></span>
                <strong class="ranking-row__value">{{ $value }}</strong><span aria-hidden="true">›</span>
            </a>
        @empty
            <div class="card empty-state"><div><h2 class="state-title">Sin datos suficientes</h2><p class="state-copy">Este ranking aparecerá cuando haya estadísticas válidas.</p></div></div>
        @endforelse
    </div>
</section>
