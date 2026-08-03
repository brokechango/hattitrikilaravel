# Corte de producción para Livewire

## Cambio obligatorio

La versión anterior era una SPA estática en Cloudflare Pages. Livewire ejecuta PHP en cada navegación y acción, por lo que Pages no puede alojar la aplicación migrada. Cloudflare puede conservar DNS, proxy, TLS perimetral y reglas WAF, pero debe apuntar a un origen Laravel.

## Artefacto

El `Dockerfile` genera una imagen multi-stage:

1. Node compila el único bundle `livewire-app` y Motion.
2. Composer instala dependencias de producción.
3. FrankenPHP sirve Laravel y assets inmutables.
4. El entrypoint exige `APP_KEY`, `SUPABASE_URL` y `SUPABASE_PUBLISHABLE_KEY`, y ejecuta `php artisan optimize`.

Cada push a `main` que supera PHPUnit, Vitest, Pint y Vite publica en GHCR las etiquetas `latest` y el SHA inmutable.

## Variables de producción

Obligatorias:

- `APP_KEY`
- `APP_URL=https://hattitrikifc.pro`
- `APP_CANONICAL_URL=https://hattitrikifc.pro`
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`

Recomendadas:

- `APP_ENV=production`
- `APP_DEBUG=false`
- `SESSION_SECURE_COOKIE=true`
- `LOG_CHANNEL=stderr`

No introduzcas `service_role` o `sb_secret_`. El servidor usa la clave publicable junto al bearer del usuario para mantener RLS.

## Procedimiento de corte

1. Genera y guarda un `APP_KEY` estable. Cambiarlo invalida sesiones y datos cifrados.
2. Arranca la imagen en un origen con volumen persistente para `storage`.
3. Comprueba `GET /up`, login, una lectura pública autenticada y una escritura de míster.
4. Configura en Supabase las URLs de redirect `https://hattitrikifc.pro/` para invitación y recuperación.
5. Cambia el origen de Cloudflare desde Pages al runtime Laravel.
6. Verifica apex y `www`; el middleware redirige `www` con 308 conservando ruta y query.
7. Conserva temporalmente el deployment Pages anterior como rollback, pero no promociones builds Livewire a Pages.

## Escalado

`compose.production.yaml` usa sesiones y caché en archivos y está diseñado para un solo nodo. Para dos o más réplicas configura Redis compartido (`SESSION_DRIVER=redis`, `CACHE_STORE=redis`) y ejecuta todas las réplicas con el mismo `APP_KEY`. Las URLs firmadas de avatar y los datos de liga siguen residiendo en Supabase.

## Rollback

El rollback de aplicación consiste en volver a desplegar la etiqueta GHCR del SHA anterior. No reviertas migraciones Supabase automáticamente: valida compatibilidad hacia atrás y aplica una migración correctiva cuando sea necesario.
