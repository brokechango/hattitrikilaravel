# Corte de producción

Auditoría realizada el 27 de julio de 2026 sobre el proyecto Supabase
`qpdpyvytdwyhskvgmkxg` y el dominio `hattitrikifc.pro`.

## Estado actual

- `hattitrikifc.pro` sirve la aplicación Kotlin/Wasm desde Cloudflare Pages.
- El proyecto original despliega por Direct Upload desde
  `hattitrikikmp/.github/workflows/web-cicd.yml`.
- Supabase está activo y contiene el esquema funcional hasta gestión de
  jugadores, perfiles, avatares y votación de MVP.
- El historial remoto de Supabase está completamente reconciliado y registra
  las 19 migraciones hasta `20260727203000_match_mvp_voting`.
- `public.goals.goalkeeper_player_id` ya acepta valores nulos.
- La tabla y las funciones de votación de MVP están aplicadas y registradas.

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

El primer job de CD volverá a ejecutar el `dry-run`; después desplegará la
Edge Function y el artefacto de Cloudflare Pages.

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
