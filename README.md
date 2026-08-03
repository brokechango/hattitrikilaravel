# Hattitriki Laravel

Aplicación privada de Hattitriki FC construida con Laravel 13, Livewire 4, Blade, Motion y Supabase.

## Arquitectura

- Livewire posee todas las rutas, pantallas, formularios y navegación.
- Laravel valida la sesión de Supabase y guarda access/refresh tokens cifrados en la sesión del servidor.
- Cada RPC, operación de Storage y Edge Function se ejecuta con la clave publicable y el bearer token del usuario, conservando RLS.
- El navegador solo habla con Laravel. La única excepción son las imágenes de avatar mediante URLs firmadas de Supabase.
- Motion es una isla pequeña para transiciones, contadores y gráficas; no contiene estado de negocio.

No existe un frontend SPA alternativo ni se usa `@supabase/supabase-js` en el navegador.

## Funcionalidades

- Inicio de sesión, recuperación, invitaciones y renovación de sesión.
- Inicio, temporadas, histórico con búsqueda/rango, rankings y perfiles.
- Actas con equipos, porteros, goles, penaltis y votación MVP.
- Avatar privado mediante Storage y URLs firmadas.
- Zona míster: plantilla, activación, borrado, actas, invitaciones y generador de equipos.
- Navegación `wire:navigate`, reduced motion y protección de formularios sin guardar.

## Desarrollo local

Requisitos: PHP 8.3+, Composer 2 y Node.js 22+.

```powershell
Copy-Item .env.example .env
composer install
php artisan key:generate
npm install
php artisan migrate
npm run build
```

Configura en `.env`:

```dotenv
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

No uses `service_role` ni una clave `sb_secret_`: las operaciones deben conservar la identidad del usuario para que RLS siga siendo la barrera de autorización.

Arranque completo:

```powershell
composer dev
```

O en terminales separadas:

```powershell
php artisan serve --host=127.0.0.1 --port=8768
npm run dev
```

## Validación

```powershell
composer test
npm test
vendor\bin\pint --test
npm run build
git diff --check
```

## Producción

Livewire necesita un runtime PHP persistente; Cloudflare Pages estático ya no es un destino válido. El repositorio incluye:

- `Dockerfile`: imagen inmutable con PHP 8.4, FrankenPHP, Composer y assets Vite.
- `compose.production.yaml`: despliegue de un solo nodo con HTTPS automático.
- `.github/workflows/web-cicd.yml`: calidad completa y publicación de la imagen en GHCR.

Para desplegar en un host Docker:

```powershell
$env:APP_KEY = 'base64:...'
$env:SUPABASE_URL = 'https://tu-proyecto.supabase.co'
$env:SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_...'
docker compose -f compose.production.yaml up -d --build
```

Cloudflare puede seguir actuando como DNS/proxy, pero el origen debe ser el contenedor Laravel, no Pages. Para varias réplicas usa Redis o una base compartida para sesiones y caché en lugar de los drivers `file` del compose de un solo nodo.

Consulta [docs/production-cutover.md](docs/production-cutover.md) para el corte de infraestructura y [docs/livewire-migration.md](docs/livewire-migration.md) para las decisiones de la migración.
