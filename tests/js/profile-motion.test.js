import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { formatProfileMetric } from '../../resources/js/profile-motion';

const profileMotionSource = readFileSync(
    new URL('../../resources/js/profile-motion.js', import.meta.url),
    'utf8',
);

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

    it('does not replay revealed dashboard sections during same-route renders', () => {
        expect(profileMotionSource).toContain('navigationId !== activeNavigationId');
        expect(profileMotionSource).toContain("revealedKeys.has('hero')");
        expect(profileMotionSource).toContain('revealedKeys.has(key)');
        expect(profileMotionSource).toContain('motionRegistry.add(stopRevealObserver)');
        expect(profileMotionSource).toContain('trackStyledAnimation');
        expect(profileMotionSource).toContain('skipVisibleReveal');
    });
});
