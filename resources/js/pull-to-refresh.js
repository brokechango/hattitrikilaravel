export const PULL_REFRESH_THRESHOLD = 68;
export const PULL_REFRESH_MAX_DISTANCE = 96;

export function canStartPullRefresh({
    scrollTop,
    touchCount,
    refreshing,
    unsaved,
    dialogOpen,
    blockedTarget,
}) {
    return scrollTop <= 0
        && touchCount === 1
        && !refreshing
        && !unsaved
        && !dialogOpen
        && !blockedTarget;
}

export function resolvePullGesture(
    startX,
    startY,
    currentX,
    currentY,
    threshold = PULL_REFRESH_THRESHOLD,
) {
    const deltaX = currentX - startX;
    const deltaY = currentY - startY;
    const verticalGesture = deltaY > 6 && deltaY > Math.abs(deltaX) * 1.2;

    if (!verticalGesture) {
        return {
            active: false,
            distance: 0,
            progress: 0,
            ready: false,
        };
    }

    const distance = Math.min(PULL_REFRESH_MAX_DISTANCE, deltaY * .55);

    return {
        active: true,
        distance,
        progress: Math.min(1, distance / threshold),
        ready: distance >= threshold,
    };
}
