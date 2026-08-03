import { describe, expect, it, vi } from 'vitest';
import {
    parseArguments,
    retry,
} from '../../scripts/verify-static-release.mjs';

describe('static release verifier', () => {
    it('parses a stability window for remote deployment checks', () => {
        expect(parseArguments([
            '--origin',
            'https://hattitrikifc.pro',
            '--attempts',
            '12',
            '--consecutive',
            '3',
            '--delay-ms',
            '10000',
        ])).toMatchObject({
            origin: 'https://hattitrikifc.pro',
            attempts: 12,
            consecutive: 3,
            delayMs: 10_000,
        });
    });

    it('rejects a stability window longer than the attempt budget', () => {
        expect(() => parseArguments([
            '--origin',
            'https://hattitrikifc.pro',
            '--attempts',
            '2',
            '--consecutive',
            '3',
        ])).toThrow(/no greater than --attempts/);
    });

    it('requires consecutive successes and resets the streak after a failure', async () => {
        const outcomes = ['pass', 'fail', 'pass', 'pass'];
        const operation = vi.fn(async () => {
            if (outcomes.shift() === 'fail') {
                throw new Error('transient propagation');
            }
        });

        await expect(retry(4, 0, operation, 2)).resolves.toBe(4);
        expect(operation).toHaveBeenCalledTimes(4);
    });
});
