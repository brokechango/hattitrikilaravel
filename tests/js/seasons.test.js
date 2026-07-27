import { describe, expect, it } from 'vitest';
import { normalizeSeasons, resolveSeasonId } from '../../resources/js/seasons';

describe('league seasons', () => {
    const seasons = normalizeSeasons([
        { id: 1, season_number: 1, name: 'Temporada 1', is_current: false, match_count: 3 },
        { id: 2, season_number: 2, name: 'Temporada 2', is_current: true, match_count: 0 },
    ]);

    it('orders seasons from newest to oldest and normalizes database values', () => {
        expect(seasons).toEqual([
            { id: 2, number: 2, name: 'Temporada 2', isCurrent: true, matchCount: 0 },
            { id: 1, number: 1, name: 'Temporada 1', isCurrent: false, matchCount: 3 },
        ]);
    });

    it('uses the current season by default', () => {
        expect(resolveSeasonId(seasons)).toBe(2);
    });

    it('keeps an explicitly selected season', () => {
        expect(resolveSeasonId(seasons, 1)).toBe(1);
    });
});
