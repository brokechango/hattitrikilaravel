import { beforeEach, describe, expect, it, vi } from 'vitest';

const motionMocks = vi.hoisted(() => ({
    animate: vi.fn(),
    animateView: vi.fn(),
    hover: vi.fn(() => vi.fn()),
    inView: vi.fn(() => vi.fn()),
    stagger: vi.fn(() => 0),
}));

vi.mock('motion', () => motionMocks);

import {
    cleanupAppMotion,
    setupAppMotion,
    transitionAppView,
} from '../../resources/js/app-motion';

function controlledAnimation() {
    let resolve;
    const finished = new Promise((complete) => {
        resolve = complete;
    });

    return {
        resolve,
        stop: vi.fn(),
        then: finished.then.bind(finished),
    };
}

function motionElement(rect) {
    return {
        closest: vi.fn(() => null),
        getBoundingClientRect: vi.fn(() => rect),
        matches: vi.fn((selector) => selector === '.page-header'),
        style: {
            removeProperty: vi.fn(),
        },
    };
}

function motionRoot(pageHeaderElements) {
    return {
        querySelector: vi.fn(() => null),
        querySelectorAll: vi.fn((selector) => (
            selector === '.page-header' ? pageHeaderElements : []
        )),
    };
}

describe('application motion behavior', () => {
    beforeEach(() => {
        cleanupAppMotion();
        vi.clearAllMocks();
        vi.stubGlobal('innerHeight', 800);
        vi.stubGlobal('innerWidth', 390);
    });

    it('clears reveal styles after the animation finishes', async () => {
        const animation = controlledAnimation();
        const element = motionElement({ top: 40, bottom: 180, left: 0, right: 320 });
        motionMocks.animate.mockReturnValue(animation);

        setupAppMotion(motionRoot([element]), { navigationId: 101 });
        animation.resolve();
        await Promise.resolve();
        await Promise.resolve();

        expect(element.style.removeProperty).toHaveBeenCalledWith('transform');
        expect(element.style.removeProperty).toHaveBeenCalledWith('opacity');
    });

    it('uses one observer for every offscreen element in a reveal group', () => {
        const elements = [900, 1100, 1300].map((top) => motionElement({
            top,
            bottom: top + 120,
            left: 0,
            right: 320,
        }));
        motionMocks.animate.mockImplementation(() => controlledAnimation());
        const stopObserver = vi.fn();
        motionMocks.inView.mockReturnValue(stopObserver);

        setupAppMotion(motionRoot(elements), { navigationId: 102 });

        expect(motionMocks.inView).toHaveBeenCalledOnce();
        expect(motionMocks.inView.mock.calls[0][0]).toEqual(elements);

        cleanupAppMotion();
        expect(stopObserver).toHaveBeenCalledOnce();
    });

    it('does not stack a visible reveal over a completed view transition', () => {
        const element = motionElement({ top: 40, bottom: 180, left: 0, right: 320 });

        setupAppMotion(motionRoot([element]), {
            navigationId: 103,
            skipVisibleReveal: true,
        });

        expect(motionMocks.animate).not.toHaveBeenCalled();
        expect(motionMocks.inView).not.toHaveBeenCalled();
    });

    it('leaves all content untouched when reduced motion is requested', () => {
        const element = motionElement({ top: 40, bottom: 180, left: 0, right: 320 });

        setupAppMotion(motionRoot([element]), {
            navigationId: 104,
            reduceMotion: true,
        });

        expect(motionMocks.animate).not.toHaveBeenCalled();
        expect(motionMocks.inView).not.toHaveBeenCalled();
    });

    it('awaits route view transitions and applies the DOM update once', async () => {
        const update = vi.fn();
        const transition = {
            new: vi.fn(() => transition),
            old: vi.fn(() => transition),
            then: (resolve) => Promise.resolve().then(resolve),
        };
        motionMocks.animateView.mockImplementation((applyUpdate) => {
            applyUpdate();
            return transition;
        });

        await transitionAppView(update, { kind: 'route' });

        expect(update).toHaveBeenCalledOnce();
        expect(transition.old).toHaveBeenCalledWith({
            opacity: 0,
            transform: 'translateY(-7px)',
        });
        expect(transition.new).toHaveBeenCalledWith({
            opacity: 1,
            transform: ['translateY(9px)', 'none'],
        });
    });

    it('falls back to an immediate update when view transitions fail', async () => {
        const update = vi.fn();
        motionMocks.animateView.mockImplementation(() => {
            throw new Error('view transitions unavailable');
        });

        await transitionAppView(update, { kind: 'content' });

        expect(update).toHaveBeenCalledOnce();
    });
});
