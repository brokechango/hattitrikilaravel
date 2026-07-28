import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
    MOTION_BASE_DURATION_MS,
    MOTION_EXIT_DURATION_MS,
    motionDelay,
    prefersReducedMotion,
    shouldAnimateRoute,
} from '../../resources/js/motion';

const css = readFileSync(new URL('../../resources/css/app.css', import.meta.url), 'utf8');

describe('motion contract', () => {
    it('animates page entry only when the route changes', () => {
        expect(shouldAnimateRoute(null, '/inicio', false)).toBe(true);
        expect(shouldAnimateRoute('/inicio', '/inicio', false)).toBe(false);
        expect(shouldAnimateRoute('/inicio', '/partidos', false)).toBe(true);
        expect(shouldAnimateRoute('/inicio', '/partidos', true)).toBe(false);
    });

    it('removes JavaScript motion delays when reduced motion is requested', () => {
        expect(MOTION_BASE_DURATION_MS).toBe(180);
        expect(MOTION_EXIT_DURATION_MS).toBe(140);
        expect(motionDelay(MOTION_EXIT_DURATION_MS, false)).toBe(140);
        expect(motionDelay(MOTION_EXIT_DURATION_MS, true)).toBe(0);
        expect(prefersReducedMotion({ matches: true })).toBe(true);
        expect(prefersReducedMotion({ matches: false })).toBe(false);
    });

    it('keeps page entry route-scoped and removes obsolete animations', () => {
        const pageRule = css.match(/\.page\s*\{[^}]*\}/s)?.[0] || '';

        expect(pageRule).not.toContain('animation:');
        expect(css).toContain('.pull-refresh-content--route-enter > .page');
        expect(css).not.toContain('page-enter');
        expect(css).not.toContain('ranking-dialog-mobile-in');
    });

    it('uses compositor-friendly motion properties', () => {
        const transitions = css.match(/transition\s*:[^;]+;/gs) || [];

        for (const transition of transitions) {
            expect(transition).not.toMatch(/\b(?:height|width|top|left)\b/);
        }

        expect(css).not.toContain('background-position-x');
        expect(css).toContain('.skeleton::after');
    });

    it('defines a reduced-motion fallback for continuous status animation', () => {
        expect(css).toContain('@media (prefers-reduced-motion: reduce)');
        expect(css).toMatch(/\.bouncing-ball-loader__ball,[\s\S]*?animation:\s*none !important;/);
        expect(css).toMatch(/\.main-scroll--refreshing \.pull-refresh-indicator__icon[\s\S]*?animation:\s*none !important;/);
    });
});
