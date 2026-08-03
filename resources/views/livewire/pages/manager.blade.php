<section class="page admin-page manager-page">
    @if ($role !== 'admin')
        <header class="page-header"><div class="page-header__copy"><h1 class="page-title">Acceso restringido</h1></div></header><div class="card error-state"><div><div class="state-icon">!</div><h2 class="state-title">Permiso de míster requerido</h2><a class="btn" href="/inicio" wire:navigate>Volver</a></div></div>
    @else
        <header class="page-header"><div class="page-header__copy"><span class="page-kicker">GESTIÓN PRIVADA</span><h1 class="page-title">Zona míster</h1><p class="page-subtitle">Gestiona partidos, plantilla y accesos.</p></div></header>
        <section class="manager-overview"><span class="manager-overview__symbol">⚙</span><div><strong>Centro de operaciones</strong><p>Prepara la jornada y mantén la liga al día.</p></div><span class="manager-overview__status"><i></i> Acceso de míster</span></section>
        <div class="admin-grid">
            @foreach ([
                ['Partidos','Crea actas y corrige resultados.',[['/mister/partidos/nuevo','＋','Nuevo partido'],['/mister/partidos','✎','Gestionar partidos']]],
                ['Plantilla y accesos','Mantén jugadores y cuentas.',[['/mister/jugadores/nuevo','＋','Añadir jugador'],['/mister/jugadores','●','Gestionar plantilla'],['/mister/invitacion','✉','Invitar a la liga']]],
                ['Herramientas','Prepara equipos equilibrados.',[['/mister/equipos','↝','Generador de equipos']]],
            ] as $index => [$title,$copy,$tools])
                <section class="card admin-section"><header class="admin-section__header"><span class="admin-section__number">0{{ $index+1 }}</span><div><h2>{{ $title }}</h2><p>{{ $copy }}</p></div></header><div class="admin-tools">@foreach($tools as [$path,$symbol,$label])<a class="admin-tool" href="{{ $path }}" wire:navigate><span class="admin-tool__icon">{{ $symbol }}</span><span class="admin-tool__copy"><strong>{{ $label }}</strong><small>Abrir herramienta</small></span><span class="admin-tool__arrow">›</span></a>@endforeach</div></section>
            @endforeach
        </div>
    @endif
</section>
