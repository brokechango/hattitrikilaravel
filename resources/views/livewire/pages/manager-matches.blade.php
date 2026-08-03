@php
    $visibleMatches = collect($adminMatches)
        ->filter(function (array $match) use ($matchType): bool {
            $hasPenalties = isset($match['team_a_penalty_score']);
            return $matchType === 'all' || ($matchType === 'penalties') === $hasPenalties;
        })
        ->filter(fn (array $match) => $matchSearch === '' || str_contains((string) ($match['played_on'] ?? ''), $matchSearch))
        ->values();
@endphp

<section class="page admin-page manager-page">
    <header class="page-header"><div class="page-header__copy"><span class="page-kicker">ACTAS</span><h1 class="page-title">Gestionar partidos</h1><p class="page-subtitle">Consulta, corrige o elimina resultados.</p></div><a class="btn" href="/mister/partidos/nuevo" wire:navigate>＋ Nuevo partido</a></header>
    @if ($role !== 'admin')
        <div class="card error-state"><div><h2 class="state-title">Acceso restringido</h2></div></div>
    @else
        <div class="card manager-filter"><label class="field"><span>Fecha</span><input class="input" type="search" wire:model.live.debounce.250ms="matchSearch" placeholder="AAAA-MM-DD"></label><label class="field"><span>Tipo</span><select class="select" wire:model.live="matchType"><option value="all">Todos</option><option value="penalties">Con penaltis</option><option value="regular">Sin penaltis</option></select></label></div>
        <p class="manager-results-count"><strong>{{ $visibleMatches->count() }}</strong> actas encontradas</p>
        <div class="card table-wrap manager-table"><table class="data-table"><thead><tr><th>Fecha</th><th>Marcador</th><th>Desempate</th><th>Acciones</th></tr></thead><tbody>
            @forelse ($visibleMatches as $match)
                <tr wire:key="admin-match-{{ $match['id'] }}"><td data-label="Fecha"><strong>{{ \Illuminate\Support\Carbon::parse($match['played_on'])->format('d/m/Y') }}</strong></td><td data-label="Marcador">{{ $match['team_a_score'] }} – {{ $match['team_b_score'] }}</td><td data-label="Desempate">{{ isset($match['team_a_penalty_score']) ? $match['team_a_penalty_score'].' – '.$match['team_b_penalty_score'].' pen.' : '—' }}</td><td data-label="Acciones"><div class="table-actions"><a class="icon-btn" href="/mister/partidos/{{ $statistics->toHex($match['id']) }}" wire:navigate aria-label="Editar acta">✎</a><button class="icon-btn" type="button" wire:click="deleteMatch('{{ $match['id'] }}')" wire:confirm="Se eliminarán también alineaciones y goles. ¿Continuar?" aria-label="Eliminar acta">⌫</button></div></td></tr>
            @empty <tr><td colspan="4">No hay partidos que coincidan con los filtros.</td></tr> @endforelse
        </tbody></table></div>
    @endif
</section>
