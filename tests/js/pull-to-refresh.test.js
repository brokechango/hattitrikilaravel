import { describe, expect, it } from 'vitest';
import {
    canStartPullRefresh,
    PULL_REFRESH_THRESHOLD,
    resolvePullGesture,
} from '../../resources/js/pull-to-refresh';

describe('pull to refresh', () => {
    it('only starts at the top of a safe, idle screen', () => {
        const safeScreen = {
            scrollTop: 0,
            touchCount: 1,
            refreshing: false,
            unsaved: false,
            dialogOpen: false,
            blockedTarget: false,
        };

        expect(canStartPullRefresh(safeScreen)).toBe(true);
        expect(canStartPullRefresh({ ...safeScreen, scrollTop: 1 })).toBe(false);
        expect(canStartPullRefresh({ ...safeScreen, unsaved: true })).toBe(false);
        expect(canStartPullRefresh({ ...safeScreen, blockedTarget: true })).toBe(false);
    });

    it('ignores horizontal and upward gestures', () => {
        expect(resolvePullGesture(10, 100, 90, 120).active).toBe(false);
        expect(resolvePullGesture(10, 100, 10, 80).active).toBe(false);
    });

    it('reports progress and arms after crossing the refresh threshold', () => {
        const partial = resolvePullGesture(20, 20, 22, 100);
        const armed = resolvePullGesture(20, 20, 22, 160);

        expect(partial.active).toBe(true);
        expect(partial.progress).toBeGreaterThan(0);
        expect(partial.ready).toBe(false);
        expect(armed.distance).toBeGreaterThanOrEqual(PULL_REFRESH_THRESHOLD);
        expect(armed.progress).toBe(1);
        expect(armed.ready).toBe(true);
    });
});
