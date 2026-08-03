export function captureViewScroll(container) {
    if (!container) return null;

    return {
        top: Number(container.scrollTop) || 0,
        left: Number(container.scrollLeft) || 0,
    };
}

export function restoreViewScroll(container, position) {
    if (!container || !position) return false;

    container.scrollTop = Number(position.top) || 0;
    container.scrollLeft = Number(position.left) || 0;

    return true;
}

export function shouldPreserveViewScroll(previousRoute, nextRoute) {
    return Boolean(previousRoute) && previousRoute === nextRoute;
}
