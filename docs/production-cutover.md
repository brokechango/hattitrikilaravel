# Corte y seguridad de producción

Auditoría realizada el 27 de julio de 2026 sobre el proyecto Supabase
`qpdpyvytdwyhskvgmkxg` y el dominio `hattitrikifc.pro`.

## Estado actual

- `hattitrikifc.pro` sirve el export estático de Laravel/Vite desde Cloudflare
  Pages.
- `www.hattitrikifc.pro` es únicamente un alias canónico: el Worker conserva
  ruta y query y redirige con `308` al dominio sin `www`.
- El despliegue se realiza por Direct Upload desde
  `.github/workflows/web-cicd.yml`.
- Supabase está activo y contiene el esquema funcional hasta gestión de
  jugadores, perfiles, avatares, votación de MVP y temporadas.
- El historial remoto de Supabase está completamente reconciliado y registra
  las migraciones hasta
  `20260727210037_disable_existing_match_mvp_voting`.
- `public.goals.goalkeeper_player_id` ya acepta valores nulos.
- La tabla y las funciones de votación de MVP están aplicadas y registradas.
- Los tres partidos anteriores a la activación del MVP están excluidos; sus
  siete votos históricos fueron eliminados. Los partidos creados después de
  ese corte tienen la votación habilitada por defecto.

## Auditoría de los incidentes web

| Incidente | Causa comprobada | Barrera permanente |
| --- | --- | --- |
| `www` y apex tenían sesiones distintas | Ambos hosts servían la SPA como orígenes independientes | Redirección canónica `308`, comprobada en PHP, Vitest y producción |
| El inicio quedaba cargando indefinidamente | `auth.getSession()` podía no resolver con una sesión persistida | Timeout de sesión y guard de arranque con reintento/limpieza |
| Preview sano pero dominio roto | Producción se publicaba antes de validar los dominios personalizados | Preview aislada → validación exacta → migraciones → producción |
| Web sin CSS | El fallback HTML de la SPA quedó cacheado bajo una URL `.css` | El Worker rechaza MIME incorrecto con `404`, `no-store` y `nosniff` |
| Un smoke test daba falsos positivos | Solo comprobaba estado y MIME de un asset | `release.json` verifica versión, bytes y SHA-256 de todo CSS/JS |
| Una pestaña antigua seguía rota | Conservaba HTML anterior y una URL de asset envenenada | `boot-guard.js` reintenta el asset una vez con cache bypass |
| Un fallo posterior al deploy dejaba producción publicada | No existía recuperación automática | Se guarda el deployment sano anterior y se ejecuta rollback por API |

Cada ejecución genera un identificador de release distinto, incluso al
reintentar el mismo commit. Ese identificador forma parte de las URLs de los
assets y evita reutilizar una entrada de caché creada durante otro intento.

## Invariantes del despliegue

El workflow no promociona una release si no se cumplen, en este orden, estas
condiciones:

1. PHPUnit, Vitest, Pint y Vite terminan correctamente.
2. El artefacto local coincide con su `release.json`.
3. Los dos dominios personalizados están activos y `main` sigue siendo la rama
   de producción de Pages.
4. Una URL preview sirve exactamente el HTML, CSS y JavaScript construidos.
5. El `dry-run` y la aplicación de migraciones de Supabase terminan
   correctamente.
6. La URL inmutable de Pages y `hattitrikifc.pro` sirven la misma release byte
   a byte durante varias comprobaciones consecutivas; las rutas `/rankings` y
   `/partidos` no sirven HTML obsoleto.
7. `www.hattitrikifc.pro` devuelve el `308` canónico exacto durante tres
   comprobaciones consecutivas.

Si el punto 6 o 7 falla, el workflow revierte Pages al deployment de producción
sano que guardó antes de publicar y finaliza en rojo.

## Reconciliación única completada

La reconciliación se completó el 27 de julio de 2026 después de verificar los
objetos existentes en producción. Se registraron como aplicadas estas
migraciones históricas:

- `20260716140000` a `20260716230000`
- `20260720120000`
- `20260721120000`
- `20260722120000`
- `20260722123000`
- `20260722170000`

Las dos migraciones del 27 de julio se aplicaron y registraron posteriormente
en este orden:

1. `20260727173822_remove_goalkeeper_goal_attribution`
2. `20260727203000_match_mvp_voting`

Antes del corte puede comprobarse que no quedan migraciones pendientes:

```powershell
supabase migration list
supabase db push --dry-run
```

El job de CD vuelve a ejecutar el `dry-run` después de validar la preview;
después despliega la Edge Function y promociona el mismo artefacto ya
verificado a Cloudflare Pages.

## Configuración de GitHub

Variables de repositorio:

- `CLOUDFLARE_ACCOUNT_ID`: `873836dad1e4f994cd5a811e3ac9bfbe`
- `CLOUDFLARE_PAGES_PROJECT`: `hattitrikikmp`
- `SUPABASE_PROJECT_REF`: `qpdpyvytdwyhskvgmkxg`
- `SUPABASE_URL`: `https://qpdpyvytdwyhskvgmkxg.supabase.co`
- `SUPABASE_PUBLISHABLE_KEY`: el valor público actual de `public/config.js`

Secretos:

- `CLOUDFLARE_API_TOKEN`
- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_DB_PASSWORD`

El entorno `cloudflare-pages` debe tener revisión obligatoria. Usa el mismo
proyecto de Pages al que ya está asociado el dominio; no es necesario cambiar
DNS para el corte.
