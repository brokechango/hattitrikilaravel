# Repository Guidelines

## Project Structure & Module Organization

This Laravel 13 application uses Vite for its JavaScript frontend and Supabase for data and authorization.

- `app/`: PHP models, middleware, providers, and controllers.
- `routes/`: Laravel routes.
- `resources/`: Livewire Blade views, Motion JavaScript, and CSS; shared football calculations live in `app/Services/LeagueStatistics.php`.
- `public/`: web entry point and generated Vite assets. Supabase runtime configuration is server-side.
- `database/`: local Laravel migrations, factories, and seeders.
- `supabase/migrations/`: timestamped PostgreSQL migrations; `supabase/functions/` contains Edge Functions.
- `tests/Feature` and `tests/Unit`: PHPUnit tests; `tests/js`: Vitest suites.

Do not edit generated files under `vendor/`, `node_modules/`, or `bootstrap/cache/`.

## Build, Test, and Development Commands

- `composer setup`: install dependencies, initialize `.env`, migrate, and build assets.
- `composer dev`: run the Laravel server, queue worker, logs, and Vite together.
- `php artisan serve --host=127.0.0.1 --port=8768`: run the application server.
- `npm run dev`: start Vite with hot reload.
- `composer test`: clear cached configuration and run PHPUnit.
- `npm test`: run JavaScript tests once; `npm run test:coverage` adds V8 coverage.
- `vendor\bin\pint --test`: check PHP formatting.
- `npm run build`: create the production frontend bundle.

## Coding Style & Naming Conventions

Follow `.editorconfig`: UTF-8, LF endings, four-space indentation, and two spaces for YAML. Use Laravel Pint for PHP, PSR-4 namespaces, `PascalCase` classes, and `camelCase` methods. Prefer strict PHP types and descriptive test names such as `test_security_headers_match_the_private_application_contract`. JavaScript uses ES modules, single quotes, and `camelCase`. Name Supabase migrations `YYYYMMDDHHMMSS_descriptive_snake_case.sql`.

## Testing Guidelines

Add feature tests for routes, middleware, and rendered responses; reserve unit tests for isolated PHP logic. Place browser-domain tests in `tests/js/*.test.js` using Vitest `describe`/`it`. Behavior changes should include regression tests. Before submitting, run `composer test`, `npm test`, Pint, and `npm run build`.

## Commit & Pull Request Guidelines

The repository has no commit history yet. Use short, imperative commits, optionally with a Conventional Commit prefix, for example `fix: preserve penalty winner calculation`. Keep commits focused. Pull requests should explain behavior and data-model changes, list validation commands, link issues, and include screenshots for UI changes. Call out Supabase migrations and deployment ordering requirements.

## Security & Configuration

Never place `service_role`, `sb_secret_`, or Supabase tokens in browser assets. Keep runtime configuration in `.env`, update `.env.example` with safe placeholders, and preserve database authorization in protected Supabase policies or RPCs rather than relying on hidden UI controls. Server requests must forward the authenticated user's bearer token so RLS remains active.
