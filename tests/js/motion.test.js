import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
    MOTION_BASE_DURATION_MS,
    MOTION_EVENT_BUFFER_MS,
    MOTION_EXIT_DURATION_MS,
    prefersReducedMotion,
    resolveAnimationDurationMs,
    shouldAnimateRoute,
    waitForAnimationEnd,
} from '../../resources/js/motion';
import { isMotionTargetVisible } from '../../resources/js/app-motion';

const css = readFileSync(new URL('../../resources/css/app.css', import.meta.url), 'utf8');
const appMotionSource = readFileSync(new URL('../../resources/js/app-motion.js', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../../resources/js/livewire-app.js', import.meta.url), 'utf8');

describe('motion contract', () => {
    it('animates page entry only when the route changes', () => {
        expect(shouldAnimateRoute(null, '/inicio', false)).toBe(true);
        expect(shouldAnimateRoute('/inicio', '/inicio', false)).toBe(false);
        expect(shouldAnimateRoute('/inicio', '/partidos', false)).toBe(true);
        expect(shouldAnimateRoute('/inicio', '/partidos', true)).toBe(false);
    });

    it('exposes shared timings and detects reduced motion', () => {
        expect(MOTION_BASE_DURATION_MS).toBe(180);
        expect(MOTION_EXIT_DURATION_MS).toBe(140);
        expect(prefersReducedMotion({ matches: true })).toBe(true);
        expect(prefersReducedMotion({ matches: false })).toBe(false);
    });

    it('waits for the real CSS animation event with a safe timeout fallback', async () => {
        const listeners = new Map();
        const element = {
            addEventListener: vi.fn((type, listener) => listeners.set(type, listener)),
            removeEventListener: vi.fn((type) => listeners.delete(type)),
        };
        const completed = waitForAnimationEnd(element, { reduceMotion: false });

        listeners.get('animationend')({ target: element });
        await completed;

        expect(element.removeEventListener).toHaveBeenCalledWith('animationcancel', expect.any(Function));

        vi.useFakeTimers();
        const fallbackElement = {
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
        };
        const fallback = waitForAnimationEnd(fallbackElement, {
            durationMs: MOTION_EXIT_DURATION_MS,
            reduceMotion: false,
        });
        await vi.advanceTimersByTimeAsync(MOTION_EXIT_DURATION_MS + MOTION_EVENT_BUFFER_MS);
        await fallback;
        vi.useRealTimers();
    });

    it('derives the fallback from computed CSS timing instead of duplicating it', () => {
        vi.stubGlobal('getComputedStyle', () => ({
            animationDelay: '50ms, 0s',
            animationDuration: '0.4s, 180ms',
        }));

        expect(resolveAnimationDurationMs({}, 140)).toBe(450);
        vi.unstubAllGlobals();
    });

    it('delegates page entry to the route transition orchestrator', () => {
        const pageRule = css.match(/\.page\s*\{[^}]*\}/s)?.[0] || '';

        expect(pageRule).not.toContain('animation:');
        expect(css).not.toContain('.pull-refresh-content--route-enter > .page');
        expect(appMotionSource).toContain("kind === 'route'");
        expect(appMotionSource).toContain('animateView');
        expect(appSource).toContain("addEventListener('livewire:navigating'");
        expect(appSource).toContain("addEventListener('livewire:navigated'");
        expect(css).not.toContain('page-enter');
        expect(css).not.toContain('ranking-dialog-mobile-in');
        expect(css).not.toContain('app-shell--route-enter');
    });

    it('loads Motion on demand without hiding already-painted content', () => {
        expect(appSource).toContain("await import('./app-motion')");
        expect(appSource).toContain('skipVisibleReveal: navigationId > 1');
        expect(appSource).toContain("Livewire?.hook('morph.updated', scheduleMotionSetup)");
        expect(appSource).toContain('contentRevision += 1');
    });

    it('protects dirty Livewire forms during soft and hard navigation', () => {
        expect(appSource).toContain("form[data-unsaved-guard]");
        expect(appSource).toContain("a[wire\\\\:navigate]");
        expect(appSource).toContain("addEventListener('beforeunload'");
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
        expect(appMotionSource).toContain('inView(offscreenElements');
        expect(appMotionSource).toContain("margin: '0px 0px -8% 0px'");
    });

    it('keys reveals by navigation and mutable content revision', () => {
        expect(appMotionSource).toContain('context.navigationId');
        expect(appMotionSource).toContain('context.contentRevision');
        expect(appMotionSource).toContain('revealedKeys.has(key)');
        expect(appMotionSource).toContain('motionRegistry.add(stopObserver)');
        expect(appMotionSource).toContain('clearRevealStyles(element)');
        expect(appMotionSource).toContain('skipVisibleReveal');
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
        expect(appSource).toContain('prefersReducedMotion()');
        expect(appSource).toContain('cleanupAppMotion();');
        expect(css).toMatch(/\.bouncing-ball-loader__ball,[\s\S]*?animation:\s*none !important;/);
        expect(css).toMatch(/\.main-scroll--refreshing \.pull-refresh-indicator__icon[\s\S]*?animation:\s*none !important;/);
    });
});
