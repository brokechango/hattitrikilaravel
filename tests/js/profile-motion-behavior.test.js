import { beforeEach, describe, expect, it, vi } from 'vitest';

const motionMocks = vi.hoisted(() => ({
    animate: vi.fn(),
    hover: vi.fn(() => vi.fn()),
    inView: vi.fn(() => vi.fn()),
    stagger: vi.fn(() => 0),
}));

vi.mock('motion', () => motionMocks);

import {
    cleanupProfileDashboardMotion,
    setupProfileDashboardMotion,
} from '../../resources/js/profile-motion';

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

function profileElement(className, rect) {
    return {
        className,
        dataset: {},
        getBoundingClientRect: vi.fn(() => rect),
        querySelector: vi.fn(() => null),
        querySelectorAll: vi.fn(() => []),
        style: {
            removeProperty: vi.fn(),
        },
    };
}

function profileRoot({ hero = [], reveals = [], interactive = [] } = {}) {
    const dashboard = {
        querySelector: vi.fn((selector) => (
            selector === '.profile-hero' ? profileElement('profile-hero', {}) : null
        )),
        querySelectorAll: vi.fn((selector) => {
            if (selector.includes('.profile-hero__identity')) return hero;
            if (selector.includes('.profile-overview')) return reveals;
            if (selector.includes('.profile-stat')) return interactive;
            return [];
        }),
    };

    return {
        querySelector: vi.fn((selector) => (
            selector === '.profile-page' ? dashboard : null
        )),
    };
}

describe('profile motion behavior', () => {
    beforeEach(() => {
        cleanupProfileDashboardMotion();
        vi.clearAllMocks();
        vi.stubGlobal('innerHeight', 800);
        vi.stubGlobal('innerWidth', 390);
    });

    it('clears section transforms after a visible reveal', async () => {
        const animation = controlledAnimation();
        const section = profileElement('profile-overview', {
            top: 100,
            bottom: 260,
            left: 0,
            right: 340,
        });
        motionMocks.animate.mockReturnValue(animation);

        setupProfileDashboardMotion(profileRoot({ reveals: [section] }), {
            navigationId: 201,
        });
        animation.resolve();
        await Promise.resolve();
        await Promise.resolve();

        expect(section.style.removeProperty).toHaveBeenCalledWith('transform');
        expect(section.style.removeProperty).toHaveBeenCalledWith('opacity');
    });

    it('batches offscreen profile sections into one observer', () => {
        const sections = [900, 1200].map((top, index) => profileElement(
            `profile-section-${index}`,
            { top, bottom: top + 150, left: 0, right: 340 },
        ));
        motionMocks.animate.mockImplementation(() => controlledAnimation());

        setupProfileDashboardMotion(profileRoot({ reveals: sections }), {
            navigationId: 202,
        });

        expect(motionMocks.inView).toHaveBeenCalledOnce();
        expect(motionMocks.inView.mock.calls[0][0]).toEqual(sections);
    });

    it('stops hover motion and releases its inline transform on leave', async () => {
        const card = profileElement('profile-stat', {
            top: 100,
            bottom: 180,
            left: 0,
            right: 220,
        });
        const enterAnimation = controlledAnimation();
        const leaveAnimation = controlledAnimation();
        let hoverStart;
        motionMocks.hover.mockImplementation((elements, start) => {
            hoverStart = start;
            return vi.fn();
        });
        motionMocks.animate
            .mockReturnValueOnce(enterAnimation)
            .mockReturnValueOnce(leaveAnimation);

        setupProfileDashboardMotion(profileRoot({ interactive: [card] }), {
            navigationId: 203,
        });
        const hoverEnd = hoverStart(card);
        hoverEnd();

        expect(enterAnimation.stop).toHaveBeenCalledOnce();

        leaveAnimation.resolve();
        await Promise.resolve();
        await Promise.resolve();
        expect(card.style.removeProperty).toHaveBeenCalledWith('transform');
    });

    it('does not clear a new hover when an older leave animation settles', async () => {
        const card = profileElement('profile-stat', {
            top: 100,
            bottom: 180,
            left: 0,
            right: 220,
        });
        const firstEnter = controlledAnimation();
        const firstLeave = controlledAnimation();
        const secondEnter = controlledAnimation();
        let hoverStart;
        motionMocks.hover.mockImplementation((elements, start) => {
            hoverStart = start;
            return vi.fn();
        });
        motionMocks.animate
            .mockReturnValueOnce(firstEnter)
            .mockReturnValueOnce(firstLeave)
            .mockReturnValueOnce(secondEnter);

        setupProfileDashboardMotion(profileRoot({ interactive: [card] }), {
            navigationId: 204,
        });
        hoverStart(card)();
        hoverStart(card);

        firstLeave.resolve();
        await Promise.resolve();
        await Promise.resolve();

        expect(card.style.removeProperty).not.toHaveBeenCalledWith('transform');
    });
});
