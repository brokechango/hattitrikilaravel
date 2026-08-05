import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const appSource = readFileSync(new URL('../../resources/js/app.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../../resources/css/app.css', import.meta.url), 'utf8');

describe('ranking podium colours', () => {
    it('identifies each podium position without changing the remaining rows', () => {
        expect(appSource).toContain('ranking-row--podium ranking-row--rank-${rankNumber}');
        expect(appSource).toContain("rankNumber <= 3");
    });

    it('keeps first place gold and gives second and third distinct metal colours', () => {
        expect(css).toContain('color: var(--podium-accent, var(--gold));');
        expect(css).toMatch(/\.ranking-row--rank-2\s*\{[^}]*--podium-accent:\s*#c7d2dc;/s);
        expect(css).toMatch(/\.ranking-row--rank-3\s*\{[^}]*--podium-accent:\s*#d58a55;/s);
    });
});
