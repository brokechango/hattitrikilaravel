export function captureStatCardPointer(card, pointerId) {
    card.setPointerCapture?.(pointerId);
}

export function movedBeyondPressTolerance(originX, originY, clientX, clientY, tolerance) {
    return Math.hypot(clientX - originX, clientY - originY) > tolerance;
}
