export const REVEAL_STYLE_PROPERTIES = ['opacity', 'transform', 'transform-origin'];

export function clearMotionStyles(element, properties = REVEAL_STYLE_PROPERTIES) {
    if (!element?.style) return;

    properties.forEach((property) => element.style.removeProperty(property));
}

export function createMotionRegistry() {
    const cleanupTasks = new Set();
    const animationStops = new WeakMap();

    function add(cleanup) {
        if (typeof cleanup !== 'function') return cleanup;

        cleanupTasks.add(cleanup);
        return cleanup;
    }

    function track(animation, onSettle = null) {
        if (!animation) return animation;

        let active = true;
        const settle = (stop = false) => {
            if (!active) return;

            active = false;
            cleanupTasks.delete(stopAnimation);
            animationStops.delete(animation);
            if (stop) animation.stop?.();
            onSettle?.();
        };
        const stopAnimation = () => settle(true);

        cleanupTasks.add(stopAnimation);
        animationStops.set(animation, stopAnimation);
        if (typeof animation.then === 'function') {
            animation.then(
                () => settle(),
                () => settle(),
            );
        }

        return animation;
    }

    function stop(animation) {
        const stopAnimation = animationStops.get(animation);
        if (stopAnimation) stopAnimation();
        else animation?.stop?.();
    }

    function cleanup() {
        [...cleanupTasks].forEach((task) => task());
        cleanupTasks.clear();
    }

    return {
        add,
        cleanup,
        size: () => cleanupTasks.size,
        stop,
        track,
    };
}
