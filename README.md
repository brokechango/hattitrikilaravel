# Hattitriki Laravel

Réplica web de Hattitriki implementada con Laravel 13, Blade, Vite y JavaScript. Conserva el diseño, las rutas, la navegación responsive y los flujos de la aplicación Kotlin/Wasm original, conectándose al mismo proyecto privado de Supabase.

## Funcionalidades

- Acceso de miembros, invitaciones y recuperación de contraseña.
- Inicio con último resultado y líderes de cada clasificación.
- Histórico con filtros por mes o rango de fechas.
- Rankings, forma reciente y perfiles completos de jugadores.
- Detalle de actas, equipos, porteros, goles y penaltis.
- Perfil propio y avatar privado con URL firmada.
- Zona míster con altas, edición, activación y borrado de jugadores.
- Creación, edición y borrado de actas en tres pasos.
- Invitaciones vinculadas a jugadores existentes.
- Generador de equipos con reparto opcional de cardio.
- Navegación inferior, lateral o superior según el espacio disponible.

La autorización sigue residiendo en PostgreSQL/Supabase. Ocultar una opción en la interfaz no concede permisos y todas las operaciones administrativas usan las RPC protegidas existentes.

## Requisitos

- PHP 8.3 o posterior.
- Composer 2.
- Node.js 22 o posterior.
- Las migraciones incluidas en `supabase/migrations` aplicadas en Supabase.

## Configuración

La copia local ya incluye `public/config.js` generado con los mismos valores públicos que usa el build web original:

```js
globalThis.HATTITRIKI_CONFIG = {
    supabaseUrl: "https://tu-proyecto.supabase.co",
    supabasePublishableKey: "sb_publishable_..."
};
```

La clave publishable está diseñada para el cliente. No uses nunca una clave `service_role`, `sb_secret_` o cualquier otro secreto en este archivo.

Para una instalación nueva:

```powershell
Copy-Item .env.example .env
composer install
php artisan key:generate
npm install
php artisan migrate
npm run build
```

## Ejecución

El proyecto queda disponible en `http://127.0.0.1:8768` con:

```powershell
php artisan serve --host=127.0.0.1 --port=8768
```

Para desarrollar con recarga automática, usa dos terminales:

```powershell
php artisan serve --host=127.0.0.1 --port=8768
npm run dev
```

## Validación

```powershell
php artisan test
npm test
npm run test:coverage
vendor\bin\pint --test
npm run build
php artisan route:list
php artisan migrate:status
```

## Rutas de cliente

La aplicación mantiene las rutas hash estables del proyecto original:

```text
#/inicio
#/partidos
#/partidos/{id-hex}
#/rankings
#/rankings/jugador/{id-hex}
#/perfil
#/mister
#/mister/partidos
#/mister/partidos/nuevo
#/mister/partidos/{id-hex}
#/mister/jugadores
#/mister/jugadores/nuevo
#/mister/jugadores/{id-hex}
#/mister/invitacion
#/mister/equipos
#/mister/equipos/resultado
```

Los identificadores se codifican en hexadecimal UTF-8 igual que en la implementación Kotlin, por lo que los enlaces son compatibles entre ambas versiones.
