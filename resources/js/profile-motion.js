import { animate, hover, inView, stagger } from 'motion';
import {
    clearMotionStyles,
    createMotionRegistry,
} from './motion-lifecycle';

const easeOut = [0.2, 0.8, 0.2, 1];
const motionRegistry = createMotionRegistry();
const styledElements = new Set();
const hoveredElements = new Set();
const hoverTokens = new WeakMap();
let activeNavigationId = null;
let revealedKeys = new Set();

export function formatProfileMetric(value, format = 'integer') {
    const numericValue = Number(value) || 0;

    if (format === 'percent') return `${Math.round(numericValue)}%`;
    if (format === 'signed') {
        const roundedValue = Math.floor(numericValue);
        return `${roundedValue > 0 ? '+' : ''}${String(roundedValue).replace('-', '−')}`;
    }
    if (format === 'decimal') {
        return new Intl.NumberFormat('es-ES', {
            maximumFractionDigits: 2,
            minimumFractionDigits: 2,
        }).format(numericValue);
    }

    return String(Math.round(numericValue));
}

function trackAnimation(animation) {
    motionRegistry.track(animation);
    return animation;
}

function trackStyledAnimation(animation, elements, properties) {
    const targets = elements && typeof elements[Symbol.iterator] === 'function'
        ? Array.from(elements)
        : [elements];
    targets.forEach((element) => styledElements.add(element));

    return motionRegistry.track(animation, () => {
        targets.forEach((element) => {
            clearMotionStyles(element, properties);
            styledElements.delete(element);
        });
    });
}

function isElementVisible(element) {
    const rect = element.getBoundingClientRect();

    return rect.bottom > 0
        && rect.top < (globalThis.innerHeight || 0) * 0.94
        && rect.right > 0
        && rect.left < (globalThis.innerWidth || 0);
}

function animateCounters(container) {
    container.querySelectorAll('[data-motion-number]').forEach((element, index) => {
        const target = Number(element.dataset.motionNumber) || 0;
        const format = element.dataset.motionFormat || 'integer';
        const animation = animate(0, target, {
            duration: 0.68,
            delay: index * 0.045,
            ease: easeOut,
            onUpdate: (latest) => {
                element.textContent = formatProfileMetric(latest, format);
            },
        });
        motionRegistry.track(animation);
    });
}

function animateProfileCharts(card) {
    const ring = card.querySelector('.profile-donut__value');
    if (ring) {
        trackStyledAnimation(animate(ring, { strokeDashoffset: [100, 0] }, {
            duration: 0.82,
            ease: easeOut,
        }), ring, ['stroke-dashoffset']);
    }

    const columns = card.querySelectorAll('.profile-form-chart__bar i');
    if (columns.length) {
        trackStyledAnimation(animate(columns, {
            opacity: [0, 1],
            scaleY: [0.06, 1],
        }, {
            duration: 0.54,
            delay: stagger(0.065),
            ease: easeOut,
        }), columns);
    }

    const resultSegments = card.querySelectorAll('.profile-balance__bar rect:not(.profile-balance__track)');
    if (resultSegments.length) {
        trackStyledAnimation(animate(resultSegments, {
            opacity: [0, 1],
            scaleX: [0.02, 1],
        }, {
            duration: 0.58,
            delay: stagger(0.08),
            ease: easeOut,
        }), resultSegments);
    }
}

export function cleanupProfileDashboardMotion() {
    motionRegistry.cleanup();
    styledElements.forEach((element) => clearMotionStyles(element));
    hoveredElements.forEach((element) => clearMotionStyles(element, ['transform']));
    styledElements.clear();
    hoveredElements.clear();
}

export function setupProfileDashboardMotion(root, options = {}) {
    cleanupProfileDashboardMotion();

    const reduceMotion = typeof options === 'boolean'
        ? options
        : Boolean(options.reduceMotion);
    const navigationId = typeof options === 'object'
        ? Number(options.navigationId) || 0
        : 0;

    if (navigationId !== activeNavigationId) {
        activeNavigationId = navigationId;
        revealedKeys = new Set();
    }

    const dashboard = root.querySelector('.profile-page');
    if (!dashboard || reduceMotion) return;
    const skipVisibleReveal = Boolean(options.skipVisibleReveal);

    const heroItems = dashboard.querySelectorAll('.profile-hero__identity, .profile-hero__numbers');
    if (heroItems.length && !revealedKeys.has('hero')) {
        revealedKeys.add('hero');
        if (!skipVisibleReveal) {
            trackStyledAnimation(animate(heroItems, {
                opacity: [0, 1],
                y: [14, 0],
            }, {
                duration: 0.46,
                delay: stagger(0.075),
                ease: easeOut,
            }), heroItems);
            animateCounters(dashboard.querySelector('.profile-hero'));
        }
    }

    const revealTargets = dashboard.querySelectorAll([
        '.profile-overview',
        '.profile-winrate',
        '.profile-form-card',
        '.profile-balance',
        '.profile-rankings-card',
        '.profile-connections',
        '.profile-explanations-wrap',
    ].join(', '));

    const offscreenTargets = [];
    const targetKeys = new Map();

    revealTargets.forEach((element, index) => {
        const key = `${element.className}:${index}`;
        element.dataset.motionKey = key;
        if (revealedKeys.has(key)) return;

        if (isElementVisible(element)) {
            revealedKeys.add(key);
            if (!skipVisibleReveal) {
                trackStyledAnimation(animate(element, {
                    opacity: [0, 1],
                    y: [22, 0],
                    scale: [0.988, 1],
                }, {
                    duration: 0.5,
                    delay: Math.min(index, 4) * 0.045,
                    ease: easeOut,
                }), element);
                animateCounters(element);
                animateProfileCharts(element);
            }
            return;
        }

        styledElements.add(element);
        motionRegistry.track(animate(element, {
            opacity: 0,
            y: 22,
            scale: 0.988,
        }, { duration: 0 }));
        offscreenTargets.push(element);
        targetKeys.set(element, key);
    });

    if (offscreenTargets.length) {
        const stopRevealObserver = inView(offscreenTargets, (element) => {
            const key = targetKeys.get(element);
            if (!key || revealedKeys.has(key)) return;
            revealedKeys.add(key);

            trackStyledAnimation(animate(element, {
                opacity: [0, 1],
                y: [22, 0],
                scale: [0.988, 1],
            }, {
                duration: 0.5,
                ease: easeOut,
            }), element);
            animateCounters(element);
            animateProfileCharts(element);
        }, { amount: 0.14, margin: '0px 0px -8% 0px' });
        motionRegistry.add(stopRevealObserver);
    }

    const interactiveCards = dashboard.querySelectorAll([
        '.profile-stat',
        '.profile-ranking-list > a',
        '.connection-card__player',
    ].join(', '));
    if (interactiveCards.length) {
        const stopHover = hover(interactiveCards, (element) => {
            hoveredElements.add(element);
            hoverTokens.set(element, {});
            const enterAnimation = trackAnimation(animate(element, {
                y: -3,
                scale: 1.012,
            }, {
                duration: 0.18,
                ease: easeOut,
            }));

            return () => {
                hoveredElements.delete(element);
                motionRegistry.stop(enterAnimation);
                const leaveToken = {};
                hoverTokens.set(element, leaveToken);
                motionRegistry.track(animate(element, {
                    y: 0,
                    scale: 1,
                }, {
                    duration: 0.2,
                    ease: easeOut,
                }), () => {
                    if (hoverTokens.get(element) !== leaveToken) return;

                    hoverTokens.delete(element);
                    clearMotionStyles(element, ['transform']);
                });
            };
        });
        motionRegistry.add(stopHover);
    }
}
