# Migración completa a Livewire

## Estado

Completada. Livewire 4 es el único frontend de Hattitriki y no existe una ruta de ejecución legacy.

## Resultado arquitectónico

- `AppShell` resuelve la ruta y decide entre autenticación y liga.
- `AuthPanel` gestiona login, recuperación, invitación y cambio de contraseña.
- `LeagueShell` gestiona vistas públicas, perfil y Zona míster.
- `SupabaseSession` cifra tokens en la sesión Laravel y los renueva antes de expirar.
- `SupabaseGateway` reenvía la identidad del usuario a RPC, Storage y Edge Functions para conservar RLS.
- `LeagueStatistics` contiene en PHP los cálculos de clasificación, portería, Elo y equilibrado.
- `livewire-app.js` se limita al callback hash de Supabase, Motion, ciclo de morph y protección de formularios sucios.

## Superficie migrada

- Todas las rutas públicas y administrativas usan `Route::livewire` y `wire:navigate`.
- Login, recuperación e invitaciones.
- Temporadas, inicio, histórico, rankings, perfil y avatar.
- Detalle de acta y votación MVP.
- CRUD de jugadores y partidos.
- Envío de invitaciones mediante Edge Function.
- Generador de equipos y traspaso del reparto a una nueva acta.

## Seguridad

- Los metadatos de ruta, identidad, rol y datos cargados desde Supabase son propiedades `#[Locked]`.
- Cada escritura administrativa vuelve a consultar `get_current_user_access`.
- Laravel nunca usa `service_role` para operaciones iniciadas por usuarios.
- El navegador no recibe configuración ni tokens Supabase persistentes.
- El fragmento temporal de invitación/recuperación se borra antes de enviarse por POST con CSRF a Laravel.
- La CSP permite conexiones del navegador únicamente al mismo origen; los avatares siguen admitidos mediante URLs firmadas.

## Motion

Motion conserva animaciones de entrada, contadores y gráficas. Se limpia en `livewire:navigating` y antes de un morph, y se reinicia en `livewire:navigated` o `morph.updated`. Cada render de contenido incrementa una revisión para evitar repeticiones y estilos huérfanos. `prefers-reduced-motion` sigue siendo vinculante.

## Criterios de salida cumplidos

- Sin `wire:ignore` para la aplicación.
- Sin `resources/js/app.js` ni `@supabase/supabase-js`.
- Sin `public/config.js`.
- Reglas de negocio portadas a PHP y cubiertas con pruebas de paridad.
- Sesión, RLS, autorización, formularios y navegación cubiertos por PHPUnit.
- Motion y su ciclo Livewire cubiertos por Vitest.
- Despliegue estático retirado y reemplazado por una imagen de servidor.
