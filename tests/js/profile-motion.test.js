import { describe, expect, it } from 'vitest';
import { formatProfileMetric } from '../../resources/js/profile-motion';

describe('profile motion metric formatting', () => {
    it('formats dashboard counters using their visible units', () => {
        expect(formatProfileMetric(12.4)).toBe('12');
        expect(formatProfileMetric(63.2, 'percent')).toBe('63%');
        expect(formatProfileMetric(0.75, 'decimal')).toBe('0,75');
    });

    it('keeps a readable sign while form counters animate', () => {
        expect(formatProfileMetric(18.9, 'signed')).toBe('+18');
        expect(formatProfileMetric(-3.1, 'signed')).toBe('−4');
        expect(formatProfileMetric(0, 'signed')).toBe('0');
    });
});
