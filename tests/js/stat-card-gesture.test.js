import { describe, expect, it, vi } from 'vitest';
import {
    captureStatCardPointer,
    movedBeyondPressTolerance,
} from '../../resources/js/stat-card-gesture';

describe('stat card gestures', () => {
    it('captures the pointer on the card so a short press still clicks the card', () => {
        const card = { setPointerCapture: vi.fn() };

        captureStatCardPointer(card, 17);

        expect(card.setPointerCapture).toHaveBeenCalledWith(17);
    });

    it('keeps small pointer movement eligible for a click', () => {
        expect(movedBeyondPressTolerance(100, 100, 106, 106, 9)).toBe(false);
        expect(movedBeyondPressTolerance(100, 100, 110, 100, 9)).toBe(true);
    });
});
