import { animate, hover, inView, stagger } from 'motion';

const easeOut = [0.2, 0.8, 0.2, 1];
let cleanupTasks = [];
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
    cleanupTasks.push(() => animation.stop());
    return animation;
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
        trackAnimation(animation);
    });
}

function animateProfileCharts(card) {
    const ring = card.querySelector('.profile-donut__value');
    if (ring) {
        trackAnimation(animate(ring, { strokeDashoffset: [100, 0] }, {
            duration: 0.82,
            ease: easeOut,
        }));
    }

    const columns = card.querySelectorAll('.profile-form-chart__bar i');
    if (columns.length) {
        trackAnimation(animate(columns, {
            opacity: [0, 1],
            scaleY: [0.06, 1],
        }, {
            duration: 0.54,
            delay: stagger(0.065),
            ease: easeOut,
        }));
    }

    const resultSegments = card.querySelectorAll('.profile-balance__bar rect:not(.profile-balance__track)');
    if (resultSegments.length) {
        trackAnimation(animate(resultSegments, {
            opacity: [0, 1],
            scaleX: [0.02, 1],
        }, {
            duration: 0.58,
            delay: stagger(0.08),
            ease: easeOut,
        }));
    }
}

export function cleanupProfileDashboardMotion() {
    cleanupTasks.forEach((cleanup) => cleanup());
    cleanupTasks = [];
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

    const heroItems = dashboard.querySelectorAll('.profile-hero__identity, .profile-hero__numbers');
    if (heroItems.length && !revealedKeys.has('hero')) {
        revealedKeys.add('hero');
        trackAnimation(animate(heroItems, {
            opacity: [0, 1],
            y: [14, 0],
        }, {
            duration: 0.46,
            delay: stagger(0.075),
            ease: easeOut,
        }));
        animateCounters(dashboard.querySelector('.profile-hero'));
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

    revealTargets.forEach((element, index) => {
        const key = `${element.className}:${index}`;
        element.dataset.motionKey = key;
        if (revealedKeys.has(key)) return;

        trackAnimation(animate(element, {
            opacity: 0,
            y: 22,
            scale: 0.988,
        }, { duration: 0 }));
    });

    const stopRevealObserver = inView(revealTargets, (element) => {
        const key = element.dataset.motionKey;
        if (!key || revealedKeys.has(key)) return;
        revealedKeys.add(key);

        trackAnimation(animate(element, {
            opacity: [0, 1],
            y: [22, 0],
            scale: [0.988, 1],
        }, {
            duration: 0.5,
            ease: easeOut,
        }));
        animateCounters(element);
        animateProfileCharts(element);
    }, { amount: 0.14, margin: '0px 0px -8% 0px' });
    cleanupTasks.push(stopRevealObserver);

    const interactiveCards = dashboard.querySelectorAll([
        '.profile-stat',
        '.profile-ranking-list > a',
        '.connection-card__player',
    ].join(', '));
    if (interactiveCards.length) {
        const stopHover = hover(interactiveCards, (element) => {
            const enterAnimation = animate(element, {
                y: -3,
                scale: 1.012,
            }, {
                duration: 0.18,
                ease: easeOut,
            });

            return () => {
                enterAnimation.stop();
                trackAnimation(animate(element, {
                    y: 0,
                    scale: 1,
                }, {
                    duration: 0.2,
                    ease: easeOut,
                }));
            };
        });
        cleanupTasks.push(stopHover);
    }
}
