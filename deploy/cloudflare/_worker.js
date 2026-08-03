const CANONICAL_HOST = 'hattitrikifc.pro';
const WWW_HOST = `www.${CANONICAL_HOST}`;
const ASSET_PATH = /^\/build\/assets\/.+\.(css|js)$/i;
const JAVASCRIPT_CONTENT_TYPES = [
    'application/javascript',
    'text/javascript',
];

const withHeaders = (response, headers) => {
    const nextHeaders = new Headers(response.headers);

    for (const [name, value] of Object.entries(headers)) {
        nextHeaders.set(name, value);
    }

    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: nextHeaders,
    });
};

const invalidAssetResponse = (pathname, contentType) => new Response(
    `Static asset unavailable: ${pathname}\n`,
    {
        status: 404,
        headers: {
            'Cache-Control': 'no-store',
            'Content-Type': 'text/plain; charset=utf-8',
            'X-Content-Type-Options': 'nosniff',
            'X-Hattitriki-Asset-Error': contentType || 'missing-content-type',
        },
    },
);

export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        if (url.hostname.toLowerCase() === WWW_HOST) {
            url.protocol = 'https:';
            url.hostname = CANONICAL_HOST;
            url.port = '';

            return Response.redirect(url.toString(), 308);
        }

        const response = await env.ASSETS.fetch(request);
        const assetMatch = url.pathname.match(ASSET_PATH);

        if (assetMatch) {
            const extension = assetMatch[1].toLowerCase();
            const contentType = (response.headers.get('content-type') || '').toLowerCase();
            const validContentType = extension === 'css'
                ? contentType.startsWith('text/css')
                : JAVASCRIPT_CONTENT_TYPES.some((type) => contentType.startsWith(type));

            // The SPA fallback must never be cacheable under a CSS/JS URL. This was
            // the cause of the unstyled production page: an HTML fallback became a
            // Cloudflare cache HIT for the hashed stylesheet path.
            if (! response.ok || ! validContentType) {
                return invalidAssetResponse(url.pathname, contentType);
            }

            return withHeaders(response, {
                'X-Content-Type-Options': 'nosniff',
            });
        }

        const contentType = (response.headers.get('content-type') || '').toLowerCase();

        if (
            contentType.startsWith('text/html')
            || ['/config.js', '/release.json'].includes(url.pathname)
        ) {
            return withHeaders(response, {
                'Cache-Control': 'no-store',
                'X-Content-Type-Options': 'nosniff',
            });
        }

        return response;
    },
};
