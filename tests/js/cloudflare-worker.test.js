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

    it('serves assets normally on the canonical and preview hosts', async () => {
        const expectedResponse = new Response('HATTITRIKI FC');
        const assets = { fetch: vi.fn().mockResolvedValue(expectedResponse) };

        for (const url of [
            'https://hattitrikifc.pro/',
            'https://preview.hattitriki.pages.dev/build/assets/app.js',
        ]) {
            const request = new Request(url);

            await expect(worker.fetch(request, { ASSETS: assets })).resolves.toBe(expectedResponse);
            expect(assets.fetch).toHaveBeenLastCalledWith(request);
        }
    });
});
