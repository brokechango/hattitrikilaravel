export const MOTION_BASE_DURATION_MS = 180;
export const MOTION_EXIT_DURATION_MS = 140;
export const MOTION_EVENT_BUFFER_MS = 80;

export function prefersReducedMotion(mediaQuery = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')) {
    return mediaQuery?.matches === true;
}

export function shouldAnimateRoute(previousRoute, nextRoute, reduceMotion = prefersReducedMotion()) {
    return !reduceMotion && previousRoute !== nextRoute;
}

function cssTimeToMilliseconds(value) {
    const numericValue = Number.parseFloat(value) || 0;
    return String(value).trim().endsWith('ms') ? numericValue : numericValue * 1000;
}

export function resolveAnimationDurationMs(element, fallbackMs = MOTION_EXIT_DURATION_MS) {
    const style = globalThis.getComputedStyle?.(element);
    if (!style) return fallbackMs;

    const durations = String(style.animationDuration || '0s')
        .split(',')
        .map(cssTimeToMilliseconds);
    const delays = String(style.animationDelay || '0s')
        .split(',')
        .map(cssTimeToMilliseconds);

    return Math.max(fallbackMs, ...durations) + Math.max(0, ...delays);
}

export function waitForAnimationEnd(element, options = {}) {
    const reduceMotion = options.reduceMotion ?? prefersReducedMotion();
    if (!element || reduceMotion) return Promise.resolve();

    const durationMs = resolveAnimationDurationMs(
        element,
        Number(options.durationMs) || MOTION_EXIT_DURATION_MS,
    );

    return new Promise((resolve) => {
        let settled = false;
        const finish = (event) => {
            if (event && event.target !== element) return;
            if (settled) return;

            settled = true;
            globalThis.clearTimeout(timeoutId);
            element.removeEventListener('animationend', finish);
            element.removeEventListener('animationcancel', finish);
            resolve();
        };
        const timeoutId = globalThis.setTimeout(
            finish,
            durationMs + MOTION_EVENT_BUFFER_MS,
        );

        element.addEventListener('animationend', finish);
        element.addEventListener('animationcancel', finish);
    });
}
