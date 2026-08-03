@php
    $profile = $routeName === 'profile' ? $ownPlayerStats : $selectedPlayerStats;
    $ownProfile = $profile && $currentPlayerId === ($profile['player']['id'] ?? null);
@endphp

<section class="page profile-page">
    @if (! $profile)
        <header class="page-header"><div class="page-header__copy"><h1 class="page-title">Perfil</h1><p class="page-subtitle">Ficha y estadísticas de la liga.</p></div></header>
        <div class="card empty-state"><div><div class="state-icon">⚽</div><h2 class="state-title">Cuenta sin jugador vinculado</h2><p class="state-copy">Un administrador debe vincular esta cuenta con un jugador.</p></div></div>
    @else
        @php
            $player = $profile['player'];
            $winRate = $profile['matchesPlayed'] ? round($profile['wins'] * 100 / $profile['matchesPlayed']) : 0;
        @endphp
        <section class="profile-hero card card--highlight">
            <div class="profile-hero__identity">
                <span class="avatar avatar--large">@if(isset($avatars[$player['id']]))<img src="{{ $avatars[$player['id']] }}" alt="Foto de {{ $player['name'] }}">@else{{ mb_strtoupper(mb_substr($player['name'], 0, 2)) }}@endif</span>
                <div><span class="page-kicker">{{ $ownProfile ? 'TU PERFIL' : 'JUGADOR' }}</span><h1>{{ $player['name'] }}</h1><p>{{ $profile['matchesPlayed'] }} partidos en esta temporada</p></div>
            </div>
            <div class="profile-hero__rating"><small>ELO</small><strong data-motion-number="{{ round($profile['eloRating']) }}">{{ round($profile['eloRating']) }}</strong><span class="{{ $profile['formScore'] >= 0 ? 'is-positive' : 'is-negative' }}">{{ $profile['formScore'] >= 0 ? '+' : '' }}{{ floor($profile['formScore']) }} forma</span></div>
        </section>

        @if ($ownProfile)
            <form class="card profile-avatar-form" wire:submit="saveAvatar">
                <label class="field"><span>Actualizar foto de perfil</span><input type="file" wire:model="avatar" accept="image/jpeg,image/webp"><small>JPG o WebP, máximo 2,5 MB.</small></label>
                @error('avatar') <p class="form-error" role="alert">{{ $message }}</p> @enderror
                <button class="btn btn--outline" type="submit" wire:loading.attr="disabled">Guardar foto</button>
            </form>
        @endif

        <section class="profile-stat-grid">
            @foreach ([['PJ', $profile['matchesPlayed'], 'Partidos'], ['G', $profile['goals'], 'Goles'], ['V', $profile['wins'], 'Victorias'], ['MVP', $profile['mvpVotes'], 'Votos']] as [$short, $value, $label])
                <article class="card profile-stat"><span>{{ $short }}</span><strong data-motion-number="{{ $value }}">{{ $value }}</strong><small>{{ $label }}</small></article>
            @endforeach
        </section>

        <div class="profile-dashboard-grid">
            <section class="card profile-winrate"><header class="profile-card-heading"><div><span>EFECTIVIDAD</span><h2>Porcentaje de victorias</h2></div></header><div class="profile-winrate__content"><div class="profile-donut"><svg viewBox="0 0 42 42" aria-hidden="true"><circle class="profile-donut__track" cx="21" cy="21" r="15.9155"></circle><circle class="profile-donut__value" cx="21" cy="21" r="15.9155" stroke-dasharray="{{ $winRate }} {{ 100 - $winRate }}"></circle></svg><span><strong data-motion-number="{{ $winRate }}" data-motion-format="percent">{{ $winRate }}%</strong><small>de partidos</small></span></div><div class="profile-winrate__copy"><strong>{{ $profile['wins'] }} de {{ $profile['matchesPlayed'] }}</strong><span>Balance de temporada</span></div></div></section>
            <section class="card profile-form-card"><header class="profile-card-heading"><div><span>ÚLTIMOS 5 PARTIDOS</span><h2>Evolución reciente</h2></div><strong class="profile-form-card__score">{{ floor($profile['formScore']) }} pts</strong></header><ol class="profile-form-chart">@foreach($profile['recentForm'] as $result)<li class="is-{{ $result }}"><span>{{ match($result) {'win'=>'V','draw'=>'E','loss'=>'D','none'=>'—',default=>'·'} }}</span></li>@endforeach</ol></section>
            <section class="card profile-balance"><header class="profile-card-heading"><div><span>RESULTADOS</span><h2>Balance</h2></div></header><dl class="profile-balance__rows"><div><dt><i class="is-win"></i>Victorias</dt><dd>{{ $profile['wins'] }}</dd></div><div><dt><i class="is-draw"></i>Empates</dt><dd>{{ $profile['draws'] }}</dd></div><div><dt><i class="is-loss"></i>Derrotas</dt><dd>{{ $profile['losses'] }}</dd></div></dl></section>
            <section class="card profile-rankings-card"><header class="profile-card-heading"><div><span>COMPARATIVA</span><h2>Rendimiento</h2></div><a href="/rankings" wire:navigate>Ver rankings ›</a></header><dl class="profile-balance__rows"><div><dt>Goles / partido</dt><dd>{{ number_format($profile['goalsPerMatch'], 1, ',', '') }}</dd></div><div><dt>Partidos de portero</dt><dd>{{ $profile['goalkeeperMatches'] }}</dd></div><div><dt>Puntuación histórica</dt><dd>{{ floor($profile['historicalScore']) }}</dd></div></dl></section>
        </div>
    @endif
</section>
