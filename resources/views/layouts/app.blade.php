<!doctype html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <meta name="theme-color" content="#081A32">
    <meta name="referrer" content="no-referrer">
    <meta name="csrf-token" content="{{ csrf_token() }}">
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
    @vite(['resources/css/app.css', 'resources/js/livewire-app.js'])
    @livewireStyles
</head>
<body>
    <a class="skip-link" href="#app">Saltar al contenido</a>
    <noscript>Hattitriki necesita JavaScript para funcionar.</noscript>
    {{ $slot }}
    @livewireScripts
</body>
</html>
