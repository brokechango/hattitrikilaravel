import { describe, expect, it } from 'vitest';
import {
    collectDisabledMvpMatchIds,
    resolveMatchMvpPlayerId,
    resolveMvpCandidates,
    resolveMvpVotingAccess,
} from '../../resources/js/mvp-voting';

describe('MVP voting availability', () => {
    const legacyMatches = collectDisabledMvpMatchIds([
        { match_id: 'match-1' },
        { match_id: 'match-2' },
        { match_id: 'match-3' },
    ]);

    it('blocks voting for the three matches captured by the migration', () => {
        expect(resolveMvpVotingAccess(
            'match-2',
            'player-1',
            ['player-1', 'player-2'],
            legacyMatches,
        )).toEqual({
            votingEnabled: false,
            eligible: false,
        });
    });

    it('allows a participant to vote in every subsequently created match', () => {
        expect(resolveMvpVotingAccess(
            'match-4',
            'player-1',
            ['player-1', 'player-2'],
            legacyMatches,
        )).toEqual({
            votingEnabled: true,
            eligible: true,
        });
    });

    it('still rejects non-participants in a new match', () => {
        expect(resolveMvpVotingAccess(
            'match-4',
            'player-3',
            ['player-1', 'player-2'],
            legacyMatches,
        )).toEqual({
            votingEnabled: true,
            eligible: false,
        });
    });
});

describe('match MVP badge', () => {
    it('identifies the unique player with the most votes', () => {
        expect(resolveMatchMvpPlayerId([
            { match_id: 'match-4', nominee_player_id: 'player-1', vote_count: 3 },
            { match_id: 'match-4', nominee_player_id: 'player-2', vote_count: 5 },
            { match_id: 'match-5', nominee_player_id: 'player-3', vote_count: 8 },
        ], 'match-4')).toBe('player-2');
    });

    it('does not assign the badge when the lead is tied', () => {
        expect(resolveMatchMvpPlayerId([
            { match_id: 'match-4', nominee_player_id: 'player-1', vote_count: 2 },
            { match_id: 'match-4', nominee_player_id: 'player-2', vote_count: 2 },
        ], 'match-4')).toBeNull();
    });

    it('does not assign the badge before any valid vote exists', () => {
        expect(resolveMatchMvpPlayerId([
            { match_id: 'match-4', nominee_player_id: 'player-1', vote_count: 0 },
        ], 'match-4')).toBeNull();
    });
});

describe('MVP candidates', () => {
    it('excludes the current player and removes duplicate participants', () => {
        expect(resolveMvpCandidates(
            ['player-1', 'player-2', 'player-1', 'player-3'],
            'player-1',
        )).toEqual(['player-2', 'player-3']);
    });
});
