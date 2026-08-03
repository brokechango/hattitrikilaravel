import { animate, inView } from 'motion';
import {
    cleanupProfileDashboardMotion,
    setupProfileDashboardMotion,
} from './profile-motion';

const EASE_OUT = [0.2, 0.8, 0.2, 1];
const REVEAL_DURATION = 0.44;
const MAX_STAGGERED_ITEMS = 6;
const VIEW_CONTENT_SELECTOR = '.page';
const ROUTE_TRANSITION_DURATION = 0.22;
const CONTENT_TRANSITION_DURATION = 0.16;

const MOTION_GROUPS = [
    { selector: '.page-header' },
    { selector: '.home-page > .league-overview' },
    { selector: '.home-page > section:not(.league-overview):not(.home-season)' },
    { selector: '.home-season__heading' },
    { selector: '.stats-grid > .stat-card' },
    { selector: '.history-sticky' },
    { selector: '.history-count', content: true },
    { selector: '.match-list > .match-row', content: true },
    { selector: '.ranking-summary', content: true },
    { selector: '.rankings-filters-toggle' },
    { selector: '.ranking-view-selector' },
    { selector: '.ranking-table > .ranking-row', content: true },
    { selector: '.match-scoreboard' },
    { selector: '.match-detail-section' },
    { selector: '.match-mvp' },
    { selector: '.manager-overview' },
    { selector: '.admin-grid > .admin-section' },
    { selector: '.manager-page--listing > .manager-filter' },
    { selector: '.manager-page--listing > .manager-results-count', content: true },
    { selector: '.manager-table tbody > tr', content: true },
    { selector: '.manager-page--form > .manager-form', content: true },
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

let cleanupTasks = [];
let revealedKeys = new Set();
let activeNavigationId = null;

export function isMotionTargetVisible(rect, viewportHeight, viewportWidth = globalThis.innerWidth) {
    return rect.bottom > 0
        && rect.top < viewportHeight * 0.94
        && rect.right > 0
        && rect.left < viewportWidth;
}

export function shouldRevealMotionGroups(renderReason = 'state') {
    return renderReason !== 'route';
}

export function viewTransitionKeyframes(kind = 'content', direction = 0) {
    if (kind === 'route') {
        return { y: [5, 0] };
    }

    if (direction) {
        return { x: [Math.sign(direction) * 8, 0] };
    }

    return { y: [2, 0] };
}

function trackAnimation(animation) {
    cleanupTasks.push(() => animation.stop());
    return animation;
}

function rememberNavigation(navigationId) {
    if (navigationId === activeNavigationId) return;

    activeNavigationId = navigationId;
    const prefix = `${navigationId}:`;
    revealedKeys = new Set([...revealedKeys].filter((key) => key.startsWith(prefix)));
}

function revealElement(element, delay = 0) {
    return trackAnimation(animate(element, {
        opacity: [0, 1],
        y: [16, 0],
        scale: [0.992, 1],
    }, {
        duration: REVEAL_DURATION,
        delay,
        ease: EASE_OUT,
    }));
}

function prepareOffscreenElement(element) {
    trackAnimation(animate(element, {
        opacity: 0,
        y: 18,
        scale: 0.992,
    }, { duration: 0 }));
}

function setupRevealGroup(root, group, context) {
    const elements = [...root.querySelectorAll(group.selector)]
        .filter((element) => !element.closest('.profile-page') || element.matches('.page-header'));

    elements.forEach((element, index) => {
        const revision = group.content ? context.contentRevision : 0;
        const key = `${context.navigationId}:${revision}:${group.selector}:${index}`;
        if (revealedKeys.has(key)) return;

        const rect = element.getBoundingClientRect();
        if (isMotionTargetVisible(rect, globalThis.innerHeight || 0)) {
            revealedKeys.add(key);
            revealElement(element, Math.min(index, MAX_STAGGERED_ITEMS - 1) * 0.032);
            return;
        }

        prepareOffscreenElement(element);
        const stopObserver = inView(element, (target) => {
            if (revealedKeys.has(key)) return;
            revealedKeys.add(key);
            revealElement(target);
        }, { amount: 0.14, margin: '0px 0px -8% 0px' });
        cleanupTasks.push(stopObserver);
    });
}

export function cleanupAppMotion() {
    cleanupTasks.forEach((cleanup) => cleanup());
    cleanupTasks = [];
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
        suppressEntrance: !shouldRevealMotionGroups(context.renderReason),
    });
    if (reduceMotion || !shouldRevealMotionGroups(context.renderReason)) return;

    const motionContext = { contentRevision, navigationId };
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
        applyUpdate();
        await Promise.resolve();

        const content = globalThis.document?.querySelector(VIEW_CONTENT_SELECTOR);
        if (!content) return;

        await animate(
            content,
            viewTransitionKeyframes(kind, options.direction),
            {
                duration: kind === 'route'
                    ? ROUTE_TRANSITION_DURATION
                    : CONTENT_TRANSITION_DURATION,
                ease: EASE_OUT,
            },
        );
    } catch {
        applyUpdate();
    }
}
