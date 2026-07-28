export const AVATAR_SIGNED_URL_TTL_SECONDS = 600;
export const AVATAR_REFRESH_INTERVAL_MS = 8 * 60 * 1000;
export const AVATAR_FAILURE_REFRESH_COOLDOWN_MS = 60 * 1000;

const AVATAR_RETRY_DELAYS_MS = [1_000, 5_000, 15_000, 60_000];

export function shouldRefreshAvatarUrls(signedAt, now = Date.now()) {
    return !signedAt || now - signedAt >= AVATAR_REFRESH_INTERVAL_MS;
}

export function avatarRetryDelay(attempt) {
    const index = Math.min(Math.max(0, attempt), AVATAR_RETRY_DELAYS_MS.length - 1);
    return AVATAR_RETRY_DELAYS_MS[index];
}

export function mapSignedAvatarUrls(rows, signedRows) {
    return (rows || []).reduce((result, row, index) => {
        const signedUrl = signedRows?.[index]?.signedUrl;

        if (signedUrl) {
            const separator = signedUrl.includes('?') ? '&' : '?';
            result.urls[row.player_id] = `${signedUrl}${separator}avatar_version=${row.avatar_version || 0}`;
        } else {
            result.missingPlayerIds.push(row.player_id);
        }

        return result;
    }, { urls: {}, missingPlayerIds: [] });
}
