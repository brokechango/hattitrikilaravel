export const MOTION_BASE_DURATION_MS = 180;
export const MOTION_EXIT_DURATION_MS = 140;

export function prefersReducedMotion(mediaQuery = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')) {
    return mediaQuery?.matches === true;
}

export function shouldAnimateRoute(previousRoute, nextRoute, reduceMotion = prefersReducedMotion()) {
    return !reduceMotion && previousRoute !== nextRoute;
}

export function motionDelay(durationMs, reduceMotion = prefersReducedMotion()) {
    return reduceMotion ? 0 : durationMs;
}
