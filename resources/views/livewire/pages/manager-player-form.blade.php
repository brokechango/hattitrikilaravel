<section class="page admin-page manager-page">
    <header class="page-header"><div class="page-header__copy"><span class="page-kicker">PLANTILLA</span><h1 class="page-title">{{ $editingPlayerId ? 'Editar jugador' : 'Nuevo jugador' }}</h1><p class="page-subtitle">Configura su nombre y perfil físico.</p></div><a class="btn btn--outline" href="/mister/jugadores" wire:navigate>Volver</a></header>
    @if ($role !== 'admin')
        <div class="card error-state"><div><h2 class="state-title">Acceso restringido</h2></div></div>
    @else
        <form class="card manager-form manager-form--compact" wire:submit="savePlayer" data-unsaved-guard>
            <div class="manager-form__main">
                <header class="manager-form__header"><span class="manager-form__icon">●</span><div><span>DATOS DEL JUGADOR</span><h2>Identidad deportiva</h2></div></header>
                <label class="manager-field"><span>Nombre <b>*</b></span><input class="input" type="text" wire:model="playerName" maxlength="120" autocomplete="off" autofocus @error('playerName') aria-invalid="true" @enderror><small>Será el nombre visible en actas, rankings y perfiles.</small>@error('playerName')<em class="field-error">{{ $message }}</em>@enderror</label>
                <label class="manager-switch-row"><span><strong>Buen cardio</strong><small>Ayuda al equilibrado automático de equipos.</small></span><span class="switch"><input type="checkbox" wire:model="playerHasCardio"><span class="switch__track"></span></span></label>
            </div>
            <div class="manager-form__actions"><a class="btn btn--text" href="/mister/jugadores" wire:navigate>Cancelar</a><button class="btn" type="submit" wire:loading.attr="disabled">{{ $editingPlayerId ? 'Guardar cambios' : 'Crear jugador' }}</button></div>
        </form>
    @endif
</section>
