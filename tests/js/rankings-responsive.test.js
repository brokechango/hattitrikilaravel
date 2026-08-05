import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const appSource = readFileSync(new URL('../../resources/js/app.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../../resources/css/app.css', import.meta.url), 'utf8');

describe('responsive detailed rankings', () => {
    it('groups labelled metrics so narrow web layouts can stack them', () => {
        expect(appSource).toContain('class="ranking-metrics"');
        expect(appSource).toContain('data-label="${esc(label)}"');
        expect(appSource).toContain("['MVP', (item) => item.formMvpVotes]");
    });

    it('uses cards below the desktop breakpoint and a spacious table above it', () => {
        expect(css).toContain('@media (max-width: 839px)');
        expect(css).toMatch(/\.ranking-row--head\.ranking-row--detailed\s*\{\s*display:\s*none;/);
        expect(css).toMatch(/\.ranking-row--metrics-5\.ranking-row--detailed \.ranking-metrics\s*\{[^}]*repeat\(4,/s);
        expect(css).toContain('@media (min-width: 840px)');
        expect(css).toMatch(/\.ranking-row--metrics-5\.ranking-row--detailed\s*\{[^}]*min-width:\s*760px;/s);
    });
});
