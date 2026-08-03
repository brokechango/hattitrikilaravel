import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
    AVATAR_FAILURE_REFRESH_COOLDOWN_MS,
    AVATAR_REFRESH_INTERVAL_MS,
    AVATAR_SIGNED_URL_TTL_SECONDS,
    avatarRetryDelay,
    mapSignedAvatarUrls,
    shouldRefreshAvatarUrls,
} from '../../resources/js/avatar-urls';

const app = readFileSync(new URL('../../resources/js/app.js', import.meta.url), 'utf8');

describe('avatar URL lifecycle', () => {
    it('refreshes signed URLs before their ten-minute expiry', () => {
        expect(AVATAR_SIGNED_URL_TTL_SECONDS).toBe(600);
        expect(AVATAR_REFRESH_INTERVAL_MS).toBe(480_000);
        expect(shouldRefreshAvatarUrls(1_000, 480_999)).toBe(false);
        expect(shouldRefreshAvatarUrls(1_000, 481_000)).toBe(true);
        expect(shouldRefreshAvatarUrls(0, 1_000)).toBe(true);
    });

    it('maps successful URLs individually and reports missing signatures', () => {
        const result = mapSignedAvatarUrls([
            { player_id: 'player-a', avatar_version: 3 },
            { player_id: 'player-b', avatar_version: 1 },
        ], [
            { signedUrl: 'https://storage.test/a?token=abc' },
            { error: 'temporary failure' },
        ]);

        expect(result.urls).toEqual({
            'player-a': 'https://storage.test/a?token=abc&avatar_version=3',
        });
        expect(result.missingPlayerIds).toEqual(['player-b']);
    });

    it('backs off retries and rate-limits refreshes caused by image errors', () => {
        expect(avatarRetryDelay(0)).toBe(1_000);
        expect(avatarRetryDelay(1)).toBe(5_000);
        expect(avatarRetryDelay(2)).toBe(15_000);
        expect(avatarRetryDelay(99)).toBe(60_000);
        expect(AVATAR_FAILURE_REFRESH_COOLDOWN_MS).toBe(60_000);
    });

    it('refreshes on page recovery and handles individual image failures', () => {
        expect(app).toContain("document.addEventListener('visibilitychange'");
        expect(app).toContain("window.addEventListener('online'");
        expect(app).toContain("window.addEventListener('pageshow'");
        expect(app).toContain("root.addEventListener('error'");
        expect(app).toContain('data-avatar-player-id');
    });
});
