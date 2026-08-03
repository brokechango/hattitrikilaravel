<main class="auth-stage{{ $flow ? ' auth-stage--flow' : '' }}" aria-label="Acceso a Hattitriki">
    <div class="auth-layout">
        <section class="auth-intro" aria-label="Hattitriki Liga Genuine">
            <div class="auth-intro__brand">
                <img src="/hattitriki-app-icon.png" alt="">
                <span><strong>HATTITRIKI FC</strong><small>LIGA GENUINE</small></span>
            </div>
            <div class="auth-intro__copy">
                <span class="auth-intro__kicker">EL FÚTBOL DE LOS DOMINGOS</span>
                <h2 class="auth-intro__title"><span>Campeones 3</span><span>Las Estadisticas</span></h2>
                <p>Resultados, actas, rachas y rankings del grupo en un mismo vestuario digital.</p>
            </div>
            <div class="auth-match-preview" aria-hidden="true">
                <span class="auth-match-preview__status"><i></i> LIGA PRIVADA</span>
                <div><span class="team-mark">A</span><strong>HATTITRIKI</strong><b>VS</b><strong>GENUINE</strong><span class="team-mark team-mark--gold">B</span></div>
                <small>RESULTADOS · ESTADÍSTICAS · ACTAS</small>
            </div>
        </section>

        <section class="auth-card{{ $flow ? ' auth-card--flow' : '' }}">
            <div class="auth-card__heading">
                <img class="auth-crest" src="/hattitriki-app-icon.png" alt="">
                <span class="auth-card__kicker">{{ $flow ? 'ACCESO SEGURO' : 'ÁREA DE MIEMBROS' }}</span>
                <h1>{{ $title }}</h1>
                <p class="auth-description">{{ $description }}</p>
            </div>

            <form class="auth-form" wire:submit="submit" novalidate>
                @if (in_array($mode, ['login', 'forgot', 'sent'], true))
                    @if ($mode !== 'sent')
                        <label class="visually-hidden" for="auth-email">Correo electrónico</label>
                        <input id="auth-email" class="input" wire:model.blur="email" type="email" inputmode="email" autocomplete="email" placeholder="Correo electrónico" autofocus>
                        @error('email') <div class="auth-message" role="alert">{{ $message }}</div> @enderror
                    @else
                        <div class="auth-message auth-success">Si no lo recibes en unos minutos, revisa spam o solicita otro enlace.</div>
                    @endif
                @endif

                @if ($mode === 'login')
                    <label class="visually-hidden" for="auth-password">Contraseña</label>
                    <input id="auth-password" class="input" wire:model="password" type="password" autocomplete="current-password" placeholder="Contraseña">
                    @error('password') <div class="auth-message" role="alert">{{ $message }}</div> @enderror
                @elseif (in_array($mode, ['invite', 'recovery'], true))
                    <label class="visually-hidden" for="auth-password">Nueva contraseña</label>
                    <input id="auth-password" class="input" wire:model="password" type="password" autocomplete="new-password" placeholder="Nueva contraseña">
                    <label class="visually-hidden" for="auth-confirm">Repite la contraseña</label>
                    <input id="auth-confirm" class="input" wire:model="passwordConfirmation" type="password" autocomplete="new-password" placeholder="Repite la contraseña">
                    @error('password') <div class="auth-message" role="alert">{{ $message }}</div> @enderror
                    @error('passwordConfirmation') <div class="auth-message" role="alert">{{ $message }}</div> @enderror
                @endif

                @error('auth') <div class="auth-message" role="alert">{{ $message }}</div> @enderror

                <button class="btn btn--wide" type="submit" wire:loading.attr="disabled">
                    <span wire:loading.remove wire:target="submit">
                        @if ($mode === 'login') Entrar
                        @elseif ($mode === 'forgot') Enviar enlace de recuperación
                        @elseif ($mode === 'sent') Enviar otro enlace
                        @elseif ($mode === 'invite') Guardar contraseña
                        @else Guardar nueva contraseña
                        @endif
                    </span>
                    <span wire:loading wire:target="submit">Procesando…</span>
                </button>
            </form>

            @if ($mode === 'login')
                <button class="btn btn--outline auth-link" type="button" wire:click="setMode('forgot')">¿Has olvidado la contraseña?</button>
            @elseif (in_array($mode, ['forgot', 'sent'], true))
                <button class="btn btn--outline btn--wide auth-link" type="button" wire:click="setMode('login')">Volver al inicio de sesión</button>
            @else
                <button class="btn btn--outline btn--wide auth-link" type="button" wire:click="cancel">Cancelar</button>
            @endif
        </section>
    </div>
</main>
