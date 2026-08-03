import { describe, expect, it, vi } from 'vitest';
import worker from '../../deploy/cloudflare/_worker';

describe('Cloudflare Pages canonical host worker', () => {
    it('redirects www requests while preserving the path and query string', async () => {
        const assets = { fetch: vi.fn() };
        const request = new Request('https://www.hattitrikifc.pro/partidos?temporada=3');

        const response = await worker.fetch(request, { ASSETS: assets });

        expect(response.status).toBe(308);
        expect(response.headers.get('location')).toBe('https://hattitrikifc.pro/partidos?temporada=3');
        expect(assets.fetch).not.toHaveBeenCalled();
    });

    it('serves documents normally on the canonical and preview hosts without caching HTML', async () => {
        const expectedResponse = new Response('HATTITRIKI FC', {
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
        const assets = { fetch: vi.fn().mockResolvedValue(expectedResponse) };

        for (const url of [
            'https://hattitrikifc.pro/',
            'https://preview.hattitriki.pages.dev/rankings',
        ]) {
            const request = new Request(url);
            const response = await worker.fetch(request, { ASSETS: assets });

            expect(response.status).toBe(200);
            expect(response.headers.get('cache-control')).toBe('no-store');
            expect(assets.fetch).toHaveBeenLastCalledWith(request);
        }
    });

    it.each([
        ['app.css', 'text/css; charset=utf-8'],
        ['app.js', 'application/javascript'],
        ['legacy.js', 'text/javascript'],
    ])('serves a valid %s asset with MIME sniffing disabled', async (filename, contentType) => {
        const assets = {
            fetch: vi.fn().mockResolvedValue(new Response('asset', {
                headers: { 'Content-Type': contentType },
            })),
        };

        const response = await worker.fetch(
            new Request(`https://hattitrikifc.pro/build/assets/${filename}?v=release`),
            { ASSETS: assets },
        );

        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toBe(contentType);
        expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    });

    it.each(['app.css', 'app.js'])(
        'rejects an HTML SPA fallback for the %s asset and forbids caching it',
        async (filename) => {
            const assets = {
                fetch: vi.fn().mockResolvedValue(new Response('<html>fallback</html>', {
                    headers: {
                        'Cache-Control': 'public, max-age=14400',
                        'Content-Type': 'text/html; charset=utf-8',
                    },
                })),
            };

            const response = await worker.fetch(
                new Request(`https://hattitrikifc.pro/build/assets/${filename}`),
                { ASSETS: assets },
            );

            expect(response.status).toBe(404);
            expect(response.headers.get('cache-control')).toBe('no-store');
            expect(response.headers.get('content-type')).toMatch(/^text\/plain/);
            expect(response.headers.get('x-content-type-options')).toBe('nosniff');
            expect(await response.text()).not.toContain('<html>');
        },
    );
});
