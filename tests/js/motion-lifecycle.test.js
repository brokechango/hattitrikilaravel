import { describe, expect, it, vi } from 'vitest';
import {
    clearMotionStyles,
    createMotionRegistry,
} from '../../resources/js/motion-lifecycle';

function controlledAnimation() {
    let resolve;
    const finished = new Promise((complete) => {
        resolve = complete;
    });

    return {
        animation: {
            stop: vi.fn(),
            then: finished.then.bind(finished),
        },
        resolve,
    };
}

describe('motion lifecycle', () => {
    it('removes completed animations from the cleanup registry', async () => {
        const registry = createMotionRegistry();
        const { animation, resolve } = controlledAnimation();
        const onSettle = vi.fn();

        registry.track(animation, onSettle);
        expect(registry.size()).toBe(1);

        resolve();
        await Promise.resolve();
        await Promise.resolve();

        expect(registry.size()).toBe(0);
        expect(animation.stop).not.toHaveBeenCalled();
        expect(onSettle).toHaveBeenCalledOnce();
    });

    it('stops active animations and settles their styles during cleanup', () => {
        const registry = createMotionRegistry();
        const { animation } = controlledAnimation();
        const onSettle = vi.fn();

        registry.track(animation, onSettle);
        registry.cleanup();

        expect(animation.stop).toHaveBeenCalledOnce();
        expect(onSettle).toHaveBeenCalledOnce();
        expect(registry.size()).toBe(0);
    });

    it('can stop one tracked animation without retaining its cleanup task', () => {
        const registry = createMotionRegistry();
        const { animation } = controlledAnimation();

        registry.track(animation);
        registry.stop(animation);

        expect(animation.stop).toHaveBeenCalledOnce();
        expect(registry.size()).toBe(0);
    });

    it('removes Motion-owned inline properties so CSS interactions can win', () => {
        const removeProperty = vi.fn();

        clearMotionStyles({ style: { removeProperty } });

        expect(removeProperty.mock.calls.map(([property]) => property)).toEqual([
            'opacity',
            'transform',
            'transform-origin',
        ]);
    });
});
