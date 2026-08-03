import { describe, expect, it, vi } from 'vitest';
import {
    captureStatCardPointer,
    movedBeyondPressTolerance,
    restoreStatCardScroll,
    shouldBlockStatCardScroll,
} from '../../resources/js/stat-card-gesture';

describe('stat card gestures', () => {
    it('captures the pointer on the stable grid because the dragged card moves in the DOM', () => {
        const grid = { setPointerCapture: vi.fn() };
        const card = {
            closest: vi.fn().mockReturnValue(grid),
            setPointerCapture: vi.fn(),
        };

        expect(captureStatCardPointer(card, 17)).toBe(grid);

        expect(grid.setPointerCapture).toHaveBeenCalledWith(17);
        expect(card.setPointerCapture).not.toHaveBeenCalled();
    });

    it('keeps small pointer movement eligible for a click', () => {
        expect(movedBeyondPressTolerance(100, 100, 106, 106, 9)).toBe(false);
        expect(movedBeyondPressTolerance(100, 100, 110, 100, 9)).toBe(true);
    });

    it('allows page scrolling until the long press activates reorder mode', () => {
        expect(shouldBlockStatCardScroll(null)).toBe(false);
        expect(shouldBlockStatCardScroll({ active: false })).toBe(false);
        expect(shouldBlockStatCardScroll({ active: true })).toBe(true);
    });

    it('restores the previous scroll position after the home is rendered again', () => {
        const container = { scrollTop: 0, scrollLeft: 0 };

        expect(restoreStatCardScroll(container, { top: 428, left: 12 })).toBe(true);
        expect(container).toEqual({ scrollTop: 428, scrollLeft: 12 });
        expect(restoreStatCardScroll(null, { top: 428, left: 12 })).toBe(false);
    });
});
