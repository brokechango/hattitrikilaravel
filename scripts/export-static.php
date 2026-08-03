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

$html = preg_replace_callback(
    '#\b(href|src)="https?://[^/"]+(/build/assets/[^"]+)"#',
    static fn (array $matches): string => sprintf('%s="%s"', $matches[1], $matches[2]),
    $html,
);

if ($html === null) {
    throw new RuntimeException('Unable to normalize Vite asset URLs.');
}

$manifestPath = $basePath.DIRECTORY_SEPARATOR.'public'.DIRECTORY_SEPARATOR.'build'.DIRECTORY_SEPARATOR.'manifest.json';
$manifestHash = is_file($manifestPath) ? hash_file('sha256', $manifestPath) : false;

if (! is_string($manifestHash)) {
    throw new RuntimeException('Unable to calculate the Vite manifest version.');
}

$releaseCommit = strtolower(trim((string) getenv('RELEASE_COMMIT')));
if (preg_match('/^[a-f0-9]{40}$/', $releaseCommit) !== 1) {
    $releaseCommit = 'local';
}

$releaseId = trim((string) getenv('RELEASE_ID'));
if ($releaseId !== '' && preg_match('/^[A-Za-z0-9._:-]{1,200}$/', $releaseId) !== 1) {
    throw new RuntimeException('RELEASE_ID contains unsupported characters.');
}

$assetVersion = substr(
    $releaseId === '' ? $manifestHash : hash('sha256', $releaseId),
    0,
    12,
);
$html = preg_replace_callback(
    '#\b(href|src)="(/build/assets/[^"?]+)"#',
    static fn (array $matches): string => sprintf(
        '%s="%s?v=%s"',
        $matches[1],
        $matches[2],
        $assetVersion,
    ),
    $html,
);

if ($html === null) {
    throw new RuntimeException('Unable to version Vite asset URLs.');
}

$releaseMeta = sprintf(
    '    <meta name="hattitriki-release" content="%s">'.PHP_EOL,
    $assetVersion,
);
$html = str_replace('</head>', $releaseMeta.'</head>', $html, $releaseMetaCount);

if ($releaseMetaCount !== 1) {
    throw new RuntimeException('Unable to add the release marker to the application document.');
}

if (str_contains($html, '@vite') || ! str_contains($html, '/build/assets/')) {
    throw new RuntimeException('The Blade view did not render production Vite assets.');
}

if (preg_match('#\b(?:href|src)="https?://[^/"]+/build/assets/#', $html) === 1) {
    throw new RuntimeException('Vite asset URLs must remain relative to support every production hostname.');
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

$assetMatches = [];
if (preg_match_all(
    '#\b(?:href|src)="(?<url>/build/assets/[^"]+)"#',
    $html,
    $assetMatches,
) === false) {
    throw new RuntimeException('Unable to collect the release assets.');
}

$releaseAssets = [];
foreach (array_values(array_unique($assetMatches['url'] ?? [])) as $assetUrl) {
    $assetPath = parse_url($assetUrl, PHP_URL_PATH);

    if (! is_string($assetPath) || ! str_starts_with($assetPath, '/build/assets/')) {
        throw new RuntimeException("Invalid release asset URL: {$assetUrl}.");
    }

    $assetFile = $normalizedTarget.str_replace('/', DIRECTORY_SEPARATOR, $assetPath);
    $assetHash = is_file($assetFile) ? hash_file('sha256', $assetFile) : false;
    $assetBytes = is_file($assetFile) ? filesize($assetFile) : false;

    if (! is_string($assetHash) || ! is_int($assetBytes)) {
        throw new RuntimeException("Unable to fingerprint release asset: {$assetPath}.");
    }

    $extension = strtolower((string) pathinfo($assetPath, PATHINFO_EXTENSION));
    $releaseAssets[] = [
        'url' => $assetUrl,
        'path' => $assetPath,
        'type' => $extension,
        'sha256' => $assetHash,
        'bytes' => $assetBytes,
    ];
}

if ($releaseAssets === []) {
    throw new RuntimeException('The release contains no Vite assets.');
}

usort(
    $releaseAssets,
    static fn (array $left, array $right): int => strcmp($left['path'], $right['path']),
);

$release = json_encode([
    'version' => $assetVersion,
    'commit' => $releaseCommit,
    'assets' => $releaseAssets,
], JSON_THROW_ON_ERROR | JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES).PHP_EOL;
$releasePath = $normalizedTarget.DIRECTORY_SEPARATOR.'release.json';

if (file_put_contents($releasePath, $release) === false) {
    throw new RuntimeException("Unable to write {$releasePath}.");
}

fwrite(STDOUT, "Static production artifact exported to {$normalizedTarget}.".PHP_EOL);
