import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const appSource = readFileSync(new URL('../../resources/js/app.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../../resources/css/app.css', import.meta.url), 'utf8');

describe('responsive rankings', () => {
    it('groups labelled metrics so narrow web layouts can stack them', () => {
        expect(appSource).toContain('class="ranking-metrics"');
        expect(appSource).toContain('data-label="${esc(label)}"');
        expect(appSource).toContain("['MVP', (item) => item.formMvpVotes]");
    });

    it('uses the rich card treatment in both compact and detailed views', () => {
        expect(appSource).toContain('ranking-row--rich${showRecentForm');
        expect(css).toContain('@media (max-width: 839px)');
        expect(css).toMatch(/\.ranking-row--head\.ranking-row--rich\s*\{\s*display:\s*none;/);
        expect(css).toMatch(/\.ranking-row--metrics-5\.ranking-row--rich \.ranking-metrics\s*\{[^}]*repeat\(4,/s);
        expect(css).toContain('@media (min-width: 840px)');
        expect(css).toMatch(/\.ranking-row--metrics-5\.ranking-row--detailed\s*\{[^}]*min-width:\s*760px;/s);
    });

    it('gives the compact desktop metrics enough room to scan independently', () => {
        expect(css).toMatch(/\.ranking-row--metrics-5\.ranking-row--rich:not\(\.ranking-row--detailed\)\s*\{[^}]*gap:\s*10px;/s);
        expect(css).toMatch(/46px 46px 52px 72px 82px;/);
    });

    it('only renders recent form in the detailed view', () => {
        expect(appSource).toContain("const showRecentForm = state.rankingView === 'detailed';");
        expect(appSource).toContain("showRecentForm ? '<span class=\"recent-form recent-form--head\">RACHA</span>' : ''");
        expect(appSource).toContain("state.rankingView === 'detailed' ? `<span class=\"recent-form\">");
    });
});
