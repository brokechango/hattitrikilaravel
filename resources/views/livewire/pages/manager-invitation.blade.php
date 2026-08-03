<section class="page admin-page manager-page">
    <header class="page-header"><div class="page-header__copy"><span class="page-kicker">ACCESOS</span><h1 class="page-title">Invitar a la liga</h1><p class="page-subtitle">Vincula una cuenta con un jugador todavía sin acceso.</p></div><a class="btn btn--outline" href="/mister" wire:navigate>Volver</a></header>
    @if ($role !== 'admin')
        <div class="card error-state"><div><h2 class="state-title">Acceso restringido</h2></div></div>
    @elseif ($invitationSuccess)
        <section class="card manager-success"><span class="state-icon">✓</span><h2>Invitación enviada</h2><p><strong>{{ $invitationSuccess['playerName'] }}</strong> recibirá el acceso en <strong>{{ $invitationSuccess['email'] }}</strong>.</p><button class="btn" type="button" wire:click="resetInvitation">Invitar a otra persona</button></section>
    @else
        <form class="card manager-form manager-form--compact manager-form--invitation" wire:submit="sendInvitation" data-unsaved-guard>
            <div class="manager-form__main"><header class="manager-form__header"><span class="manager-form__icon">✉</span><div><span>INVITACIÓN SEGURA</span><h2>Jugador y correo</h2></div></header>
                <label class="manager-field"><span>Jugador <b>*</b></span><select class="select" wire:model="invitationPlayerId"><option value="">Selecciona un jugador</option>@foreach ($invitablePlayers as $player)<option value="{{ $player['id'] }}">{{ $player['name'] }}</option>@endforeach</select>@error('invitationPlayerId')<em class="field-error">{{ $message }}</em>@enderror</label>
                <label class="manager-field"><span>Correo <b>*</b></span><input class="input" type="email" wire:model="invitationEmail" autocomplete="email" placeholder="persona@ejemplo.com">@error('invitationEmail')<em class="field-error">{{ $message }}</em>@enderror</label>
            </div>
            <aside class="manager-form__aside"><strong>Enlace de un solo uso</strong><p>Supabase enviará un enlace para que la persona establezca su contraseña. El acceso quedará ligado al jugador seleccionado.</p></aside>
            <div class="manager-form__actions"><a class="btn btn--text" href="/mister" wire:navigate>Cancelar</a><button class="btn" type="submit" wire:loading.attr="disabled">Enviar invitación</button></div>
        </form>
    @endif
</section>
