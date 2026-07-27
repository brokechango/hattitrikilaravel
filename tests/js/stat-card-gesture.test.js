import { describe, expect, it, vi } from 'vitest';
import {
    captureStatCardPointer,
    movedBeyondPressTolerance,
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
});
