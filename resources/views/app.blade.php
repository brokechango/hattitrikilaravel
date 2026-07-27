<!doctype html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <meta name="theme-color" content="#081A32">
    <meta name="referrer" content="no-referrer">
    <meta
        name="description"
        content="Hattitriki FC: resultados, estadísticas, rankings y actas de nuestra liga de fútbol amistosa. Acceso privado para miembros."
    >
    <meta name="robots" content="index, follow">
    <title>Hattitriki FC · Liga de fútbol amistosa</title>
    <link rel="icon" href="/hattitriki-app-icon.png" type="image/png">
    <link rel="apple-touch-icon" href="/hattitriki-app-icon.png">
    <link rel="preload" href="/hattitriki-app-icon.png" as="image" fetchpriority="high">
    <script src="/boot-guard.js"></script>
    <script src="/config.js"></script>
    @vite(['resources/css/app.css', 'resources/js/app.js'])
</head>
<body>
    <a class="skip-link" href="#app">Saltar al contenido</a>
    <noscript>Hattitriki necesita JavaScript para funcionar.</noscript>
    <div id="app" aria-live="polite">
        <main class="auth-stage" aria-busy="true" aria-label="Acceso a Hattitriki">
            <section class="auth-card auth-card--loading" data-boot-loader>
                <img class="auth-crest" src="/hattitriki-app-icon.png" alt="">
                <h1>HATTITRIKI FC</h1>
                <p>Preparando el acceso a la liga…</p>
                <div class="bouncing-ball-loader" aria-hidden="true">
                    <span class="bouncing-ball-loader__ball">⚽</span>
                    <span class="bouncing-ball-loader__shadow"></span>
                </div>
            </section>
        </main>
    </div>
</body>
</html>
