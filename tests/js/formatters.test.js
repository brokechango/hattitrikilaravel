import { describe, expect, it } from 'vitest';
import { formatFlooredTotal } from '../../resources/js/formatters.js';

describe('formatFlooredTotal', () => {
    it('removes the positive sign and rounds positive totals down', () => {
        expect(formatFlooredTotal(24.3)).toBe('24');
    });

    it('rounds negative totals down', () => {
        expect(formatFlooredTotal(-5.4)).toBe('−6');
    });

    it('shows zero without a sign', () => {
        expect(formatFlooredTotal(0)).toBe('0');
    });
});
