import { describe, expect, it } from 'vitest';
import {
    collectDisabledMvpMatchIds,
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
