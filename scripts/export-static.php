<?php

declare(strict_types=1);

use Illuminate\Contracts\Console\Kernel;

require dirname(__DIR__).'/vendor/autoload.php';

$basePath = dirname(__DIR__);
$relativeTarget = $argv[1] ?? 'dist';
$targetPath = str_starts_with($relativeTarget, DIRECTORY_SEPARATOR)
    || preg_match('/^[A-Za-z]:[\\\\\/]/', $relativeTarget) === 1
        ? $relativeTarget
        : $basePath.DIRECTORY_SEPARATOR.$relativeTarget;

$normalizePath = static fn (string $path): string => rtrim(
    str_replace(['/', '\\'], DIRECTORY_SEPARATOR, $path),
    DIRECTORY_SEPARATOR,
);

$normalizedBase = $normalizePath($basePath);
$normalizedTarget = $normalizePath($targetPath);
$baseComparison = DIRECTORY_SEPARATOR === '\\' ? strtolower($normalizedBase) : $normalizedBase;
$targetComparison = DIRECTORY_SEPARATOR === '\\' ? strtolower($normalizedTarget) : $normalizedTarget;

if (! str_starts_with($targetComparison, $baseComparison.DIRECTORY_SEPARATOR)) {
    throw new RuntimeException('The static export directory must be inside the project.');
}

$removeDirectory = static function (string $directory) use (&$removeDirectory): void {
    if (! is_dir($directory)) {
        return;
    }

    $items = scandir($directory);
    if ($items === false) {
        throw new RuntimeException("Unable to inspect {$directory}.");
    }

    foreach ($items as $item) {
        if ($item === '.' || $item === '..') {
            continue;
        }

        $path = $directory.DIRECTORY_SEPARATOR.$item;
        if (is_dir($path) && ! is_link($path)) {
            $removeDirectory($path);
        } elseif (! unlink($path)) {
            throw new RuntimeException("Unable to remove {$path}.");
        }
    }

    if (! rmdir($directory)) {
        throw new RuntimeException("Unable to remove {$directory}.");
    }
};

$copyDirectory = static function (string $source, string $destination) use (&$copyDirectory): void {
    if (! is_dir($destination) && ! mkdir($destination, 0755, true) && ! is_dir($destination)) {
        throw new RuntimeException("Unable to create {$destination}.");
    }

    $items = scandir($source);
    if ($items === false) {
        throw new RuntimeException("Unable to inspect {$source}.");
    }

    foreach ($items as $item) {
        if (in_array($item, ['.', '..', '.htaccess', 'hot', 'index.php', 'config.js'], true)) {
            continue;
        }

        $sourcePath = $source.DIRECTORY_SEPARATOR.$item;
        $destinationPath = $destination.DIRECTORY_SEPARATOR.$item;

        if (is_dir($sourcePath)) {
            $copyDirectory($sourcePath, $destinationPath);
        } elseif (! copy($sourcePath, $destinationPath)) {
            throw new RuntimeException("Unable to copy {$sourcePath}.");
        }
    }
};

$supabaseUrl = trim((string) getenv('SUPABASE_URL'));
$supabasePublishableKey = trim((string) getenv('SUPABASE_PUBLISHABLE_KEY'));
$parsedUrl = parse_url($supabaseUrl);
$supabaseHost = is_array($parsedUrl) ? ($parsedUrl['host'] ?? '') : '';

if (
    ! is_array($parsedUrl)
    || ($parsedUrl['scheme'] ?? '') !== 'https'
    || ! str_ends_with($supabaseHost, '.supabase.co')
    || array_intersect(['user', 'pass', 'query', 'fragment'], array_keys($parsedUrl)) !== []
) {
    throw new RuntimeException('SUPABASE_URL must be an HTTPS Supabase origin without credentials, query or fragment.');
}

if (
    ! str_starts_with($supabasePublishableKey, 'sb_publishable_')
    || str_contains(strtolower($supabasePublishableKey), 'service_role')
    || str_contains(strtolower($supabasePublishableKey), 'sb_secret_')
) {
    throw new RuntimeException('SUPABASE_PUBLISHABLE_KEY must contain a publishable client key.');
}

$removeDirectory($normalizedTarget);
if (! mkdir($normalizedTarget, 0755, true) && ! is_dir($normalizedTarget)) {
    throw new RuntimeException("Unable to create {$normalizedTarget}.");
}

$copyDirectory($basePath.DIRECTORY_SEPARATOR.'public', $normalizedTarget);

$application = require $basePath.DIRECTORY_SEPARATOR.'bootstrap'.DIRECTORY_SEPARATOR.'app.php';
$application->make(Kernel::class)->bootstrap();
$html = view('app')->render();

if (str_contains($html, '@vite') || ! str_contains($html, '/build/assets/')) {
    throw new RuntimeException('The Blade view did not render production Vite assets.');
}

$config = sprintf(
    "globalThis.HATTITRIKI_CONFIG = Object.freeze({\n  supabaseUrl: %s,\n  supabasePublishableKey: %s\n});\n",
    json_encode($supabaseUrl, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES),
    json_encode($supabasePublishableKey, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES),
);

$files = [
    $normalizedTarget.DIRECTORY_SEPARATOR.'index.html' => $html,
    $normalizedTarget.DIRECTORY_SEPARATOR.'config.js' => $config,
];

foreach ($files as $path => $contents) {
    if (file_put_contents($path, $contents) === false) {
        throw new RuntimeException("Unable to write {$path}.");
    }
}

$cloudflareDirectory = $basePath.DIRECTORY_SEPARATOR.'deploy'.DIRECTORY_SEPARATOR.'cloudflare';
$copyDirectory($cloudflareDirectory, $normalizedTarget);

fwrite(STDOUT, "Static production artifact exported to {$normalizedTarget}.".PHP_EOL);
