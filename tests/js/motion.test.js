import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
    MOTION_BASE_DURATION_MS,
    MOTION_EXIT_DURATION_MS,
    motionDelay,
    prefersReducedMotion,
    shouldAnimateRoute,
} from '../../resources/js/motion';
import {
    isMotionTargetVisible,
    shouldRevealMotionGroups,
    viewTransitionKeyframes,
} from '../../resources/js/app-motion';

const css = readFileSync(new URL('../../resources/css/app.css', import.meta.url), 'utf8');
const appMotionSource = readFileSync(new URL('../../resources/js/app-motion.js', import.meta.url), 'utf8');

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

    it('enters the new page without crossfading the old screen', () => {
        const pageRule = css.match(/\.page\s*\{[^}]*\}/s)?.[0] || '';
        const transitionSource = appMotionSource.match(/export async function transitionAppView[\s\S]*$/)?.[0] || '';

        expect(pageRule).not.toContain('animation:');
        expect(css).not.toContain('.pull-refresh-content--route-enter > .page');
        expect(appMotionSource).toContain("kind === 'route'");
        expect(appMotionSource).not.toContain('animateView');
        expect(transitionSource).toContain('globalThis.document?.querySelector(VIEW_CONTENT_SELECTOR)');
        expect(transitionSource).not.toContain('opacity');
        expect(css).not.toContain('::view-transition-');
        expect(viewTransitionKeyframes('route')).toEqual({ y: [5, 0] });
        expect(viewTransitionKeyframes('content', 1)).toEqual({ x: [8, 0] });
        expect(viewTransitionKeyframes('content', -1)).toEqual({ x: [-8, 0] });
        expect(css).not.toContain('page-enter');
        expect(css).not.toContain('ranking-dialog-mobile-in');
    });

    it('avoids replaying child reveals during a route transition', () => {
        expect(shouldRevealMotionGroups('route')).toBe(false);
        expect(shouldRevealMotionGroups('content')).toBe(true);
        expect(shouldRevealMotionGroups('state')).toBe(true);
        expect(appMotionSource).toContain('suppressEntrance: !shouldRevealMotionGroups(context.renderReason)');
    });

    it('waits to reveal offscreen targets until they enter the viewport', () => {
        expect(isMotionTargetVisible({
            top: 100,
            bottom: 220,
            left: 0,
            right: 320,
        }, 800, 390)).toBe(true);
        expect(isMotionTargetVisible({
            top: 900,
            bottom: 1020,
            left: 0,
            right: 320,
        }, 800, 390)).toBe(false);
        expect(appMotionSource).toContain('prepareOffscreenElement(element)');
        expect(appMotionSource).toContain('inView(element');
        expect(appMotionSource).toContain("margin: '0px 0px -8% 0px'");
    });

    it('keys reveals by navigation and mutable content revision', () => {
        expect(appMotionSource).toContain('context.navigationId');
        expect(appMotionSource).toContain('context.contentRevision');
        expect(appMotionSource).toContain('revealedKeys.has(key)');
        expect(appMotionSource).toContain('cleanupTasks.push(stopObserver)');
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
