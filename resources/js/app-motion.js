import { animate, animateView, inView } from 'motion';
import {
    clearMotionStyles,
    createMotionRegistry,
} from './motion-lifecycle';
import {
    cleanupProfileDashboardMotion,
    setupProfileDashboardMotion,
} from './profile-motion';

const EASE_OUT = [0.2, 0.8, 0.2, 1];
const REVEAL_DURATION = 0.44;
const MAX_STAGGERED_ITEMS = 6;

const MOTION_GROUPS = [
    { selector: '.page-header' },
    { selector: '.home-page > .league-overview' },
    { selector: '.home-page > section:not(.league-overview):not(.home-season)' },
    { selector: '.home-season__heading' },
    { selector: '.stats-grid > .stat-card' },
    { selector: '.feature-grid > .feature-card' },
    { selector: '.history-sticky' },
    { selector: '.history-count', content: true },
    { selector: '.match-list > .match-row', content: true },
    { selector: '.ranking-summary', content: true },
    { selector: '.rankings-filters-toggle' },
    { selector: '.ranking-view-selector' },
    { selector: '.ranking-table > .ranking-row', content: true },
    { selector: '.ranking-tabs', content: true },
    { selector: '.ranking-list > .ranking-row', content: true },
    { selector: '.match-scoreboard' },
    { selector: '.match-detail-section' },
    { selector: '.match-mvp' },
    { selector: '.manager-overview' },
    { selector: '.admin-grid > .admin-section' },
    { selector: '.manager-page--listing > .manager-filter' },
    { selector: '.manager-page--listing > .manager-results-count', content: true },
    { selector: '.manager-table tbody > tr', content: true },
    { selector: '.manager-page--form > .manager-form', content: true },
    { selector: '.manager-form > .manager-form__main', content: true },
    { selector: '.manager-tool-panel', content: true },
    { selector: '.selection-grid > .select-player', content: true },
    { selector: '.match-editor__progress' },
    { selector: '.match-editor__body', content: true },
    { selector: '.randomizer-workspace > .randomizer-roster' },
    { selector: '.randomizer-workspace > .randomizer-setup' },
    { selector: '.randomizer-player-grid > .randomizer-player' },
    { selector: '.randomizer-result-hero', content: true },
    { selector: '.randomizer-result-grid > .generated-team', content: true },
    { selector: '.randomizer-result-footer', content: true },
    { selector: '.auth-intro' },
    { selector: '.auth-card', content: true },
];

const motionRegistry = createMotionRegistry();
const styledElements = new Set();
let revealedKeys = new Set();
let activeNavigationId = null;

export function isMotionTargetVisible(rect, viewportHeight, viewportWidth = globalThis.innerWidth) {
    return rect.bottom > 0
        && rect.top < viewportHeight * 0.94
        && rect.right > 0
        && rect.left < viewportWidth;
}

function clearRevealStyles(element) {
    clearMotionStyles(element);
    styledElements.delete(element);
}

function rememberNavigation(navigationId) {
    if (navigationId === activeNavigationId) return;

    activeNavigationId = navigationId;
    const prefix = `${navigationId}:`;
    revealedKeys = new Set([...revealedKeys].filter((key) => key.startsWith(prefix)));
}

function revealElement(element, delay = 0) {
    styledElements.add(element);
    return motionRegistry.track(animate(element, {
        opacity: [0, 1],
        y: [16, 0],
        scale: [0.992, 1],
    }, {
        duration: REVEAL_DURATION,
        delay,
        ease: EASE_OUT,
    }), () => clearRevealStyles(element));
}

function prepareOffscreenElement(element) {
    styledElements.add(element);
    motionRegistry.track(animate(element, {
        opacity: 0,
        y: 18,
        scale: 0.992,
    }, { duration: 0 }));
}

function setupRevealGroup(root, group, context) {
    const elements = [...root.querySelectorAll(group.selector)]
        .filter((element) => !element.closest('.profile-page') || element.matches('.page-header'));
    const offscreenElements = [];
    const offscreenKeys = new Map();

    elements.forEach((element, index) => {
        const revision = group.content ? context.contentRevision : 0;
        const key = `${context.navigationId}:${revision}:${group.selector}:${index}`;
        if (revealedKeys.has(key)) return;

        const rect = element.getBoundingClientRect();
        if (isMotionTargetVisible(rect, globalThis.innerHeight || 0)) {
            revealedKeys.add(key);
            if (!context.skipVisibleReveal) {
                revealElement(element, Math.min(index, MAX_STAGGERED_ITEMS - 1) * 0.032);
            }
            return;
        }

        prepareOffscreenElement(element);
        offscreenElements.push(element);
        offscreenKeys.set(element, key);
    });

    if (!offscreenElements.length) return;

    const stopObserver = inView(offscreenElements, (target) => {
        const key = offscreenKeys.get(target);
        if (!key || revealedKeys.has(key)) return;

        revealedKeys.add(key);
        revealElement(target);
    }, { amount: 0.14, margin: '0px 0px -8% 0px' });
    motionRegistry.add(stopObserver);
}

export function cleanupAppMotion() {
    motionRegistry.cleanup();
    styledElements.forEach((element) => clearMotionStyles(element));
    styledElements.clear();
    cleanupProfileDashboardMotion();
}

export function setupAppMotion(root, context = {}) {
    cleanupAppMotion();
    const reduceMotion = Boolean(context.reduceMotion);
    const navigationId = Number(context.navigationId) || 0;
    const contentRevision = Number(context.contentRevision) || 0;

    rememberNavigation(navigationId);
    setupProfileDashboardMotion(root, {
        navigationId,
        reduceMotion,
        skipVisibleReveal: Boolean(context.skipVisibleReveal),
    });
    if (reduceMotion) return;

    const motionContext = {
        contentRevision,
        navigationId,
        skipVisibleReveal: Boolean(context.skipVisibleReveal),
    };
    MOTION_GROUPS.forEach((group) => setupRevealGroup(root, group, motionContext));
}

export async function transitionAppView(update, options = {}) {
    const kind = options.kind === 'route' ? 'route' : 'content';
    if (options.reduceMotion) {
        update();
        return;
    }

    let updated = false;
    const applyUpdate = () => {
        if (updated) return;
        updated = true;
        update();
    };

    try {
        const transition = animateView(applyUpdate, {
            duration: kind === 'route' ? 0.3 : 0.2,
        });

        if (kind === 'route') {
            transition
                .old({ opacity: 0, transform: 'translateY(-7px)' })
                .new({ opacity: 1, transform: ['translateY(9px)', 'none'] });
        } else if (options.direction) {
            const offset = Math.sign(options.direction) * 9;
            transition
                .old({ opacity: 0, transform: `translateX(${-offset}px)` })
                .new({ opacity: 1, transform: [`translateX(${offset}px)`, 'none'] });
        } else {
            transition
                .old({ opacity: 0.72 })
                .new({ opacity: 1 });
        }

        await transition;
    } catch {
        applyUpdate();
    }
}
