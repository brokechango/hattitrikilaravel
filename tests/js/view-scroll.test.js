import { describe, expect, it } from 'vitest';
import {
    captureViewScroll,
    restoreViewScroll,
    shouldPreserveViewScroll,
} from '../../resources/js/view-scroll';

describe('view scroll persistence', () => {
    it('captures and restores both scroll axes around a same-screen render', () => {
        const previousContainer = { scrollTop: 684, scrollLeft: 18 };
        const nextContainer = { scrollTop: 0, scrollLeft: 0 };
        const position = captureViewScroll(previousContainer);

        expect(restoreViewScroll(nextContainer, position)).toBe(true);
        expect(nextContainer).toEqual({ scrollTop: 684, scrollLeft: 18 });
    });

    it('preserves scroll only while the route stays on the same screen', () => {
        expect(shouldPreserveViewScroll('/perfil', '/perfil')).toBe(true);
        expect(shouldPreserveViewScroll('/partidos', '/partidos/abc')).toBe(false);
        expect(shouldPreserveViewScroll('/inicio', '/rankings')).toBe(false);
        expect(shouldPreserveViewScroll(null, '/inicio')).toBe(false);
    });

    it('does nothing before a scroll container exists', () => {
        expect(captureViewScroll(null)).toBeNull();
        expect(restoreViewScroll(null, { top: 120, left: 0 })).toBe(false);
        expect(restoreViewScroll({ scrollTop: 0, scrollLeft: 0 }, null)).toBe(false);
    });
});
