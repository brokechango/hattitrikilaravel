export function captureStatCardPointer(card, pointerId) {
    const stableGrid = card.closest?.('.stats-grid');

    stableGrid?.setPointerCapture?.(pointerId);

    return stableGrid ?? null;
}

export function movedBeyondPressTolerance(originX, originY, clientX, clientY, tolerance) {
    return Math.hypot(clientX - originX, clientY - originY) > tolerance;
}

export function shouldBlockStatCardScroll(reorder) {
    return Boolean(reorder?.active);
}
