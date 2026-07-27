import { describe, expect, it } from 'vitest';
import { calculatePlayerStats, fromHex, matchWinner, toHex } from '../../resources/js/football';

const snapshot = {
    players: [
        { id: 'ana', name: 'Ana' },
        { id: 'bea', name: 'Bea' },
        { id: 'carla', name: 'Carla' },
    ],
    matches: [
        {
            id: 'm2',
            playedOn: '2026-07-08',
            teamAScore: 0,
            teamBScore: 0,
            teamAPenaltyScore: 3,
            teamBPenaltyScore: 2,
            participants: [
                { player_id: 'ana', team: 'A', was_goalkeeper: true },
                { player_id: 'bea', team: 'B', was_goalkeeper: false },
            ],
            goals: [],
        },
        {
            id: 'm1',
            playedOn: '2026-07-01',
            teamAScore: 2,
            teamBScore: 1,
            teamAPenaltyScore: null,
            teamBPenaltyScore: null,
            participants: [
                { player_id: 'ana', team: 'A', was_goalkeeper: false },
                { player_id: 'bea', team: 'B', was_goalkeeper: true },
                { player_id: 'carla', team: 'B', was_goalkeeper: true },
            ],
            goals: [
                { player_id: 'ana', goalkeeper_id: 'bea', count: 2, is_own_goal: false },
                { player_id: 'carla', goalkeeper_id: 'ana', count: 1, is_own_goal: false },
            ],
        },
    ],
};

describe('stable browser identifiers', () => {
    it('matches the Kotlin UTF-8 hexadecimal format', () => {
        expect(toHex('jugador-á')).toBe('6a756761646f722dc3a1');
        expect(fromHex('6a756761646f722dc3a1')).toBe('jugador-á');
    });

    it('rejects invalid identifiers', () => {
        expect(fromHex('xyz')).toBe('');
        expect(fromHex('0')).toBe('');
    });
});

describe('football calculations', () => {
    it('decides regular and penalty winners', () => {
        expect(matchWinner(snapshot.matches[1])).toBe('A');
        expect(matchWinner(snapshot.matches[0])).toBe('A');
        expect(matchWinner({ ...snapshot.matches[0], teamAPenaltyScore: null, teamBPenaltyScore: null })).toBeNull();
    });

    it('calculates goals, form and evenly split goalkeeper totals', () => {
        const stats = calculatePlayerStats(snapshot);
        const ana = stats.find((item) => item.player.id === 'ana');
        const bea = stats.find((item) => item.player.id === 'bea');
        const carla = stats.find((item) => item.player.id === 'carla');

        expect(ana).toMatchObject({
            matchesPlayed: 2,
            wins: 2,
            goals: 2,
            goalkeeperMatches: 1,
            goalsAgainst: 0,
            recentForm: ['win', 'win', 'pending', 'pending', 'pending'],
        });
        expect(bea.goalsAgainst).toBe(1);
        expect(carla.goalsAgainst).toBe(1);
        expect(carla.recentForm).toEqual(['loss', 'none', 'pending', 'pending', 'pending']);
        expect(ana.assignedGoalsAgainst).toBe(0);
        expect(bea.assignedGoalsAgainst).toBe(1);
        expect(carla.assignedGoalsAgainst).toBe(1);
    });

    it('uses the first team when the same player appears for both sides', () => {
        const dualTeamSnapshot = {
            players: [{ id: 'ana', name: 'Ana' }],
            matches: [{
                id: 'dual',
                teamAScore: 1,
                teamBScore: 0,
                teamAPenaltyScore: null,
                teamBPenaltyScore: null,
                participants: [
                    { player_id: 'ana', team: 'B', was_goalkeeper: false },
                    { player_id: 'ana', team: 'A', was_goalkeeper: false },
                ],
                goals: [],
            }],
        };

        expect(calculatePlayerStats(dualTeamSnapshot)[0]).toMatchObject({
            matchesPlayed: 1,
            wins: 0,
            losses: 1,
            recentForm: ['loss', 'pending', 'pending', 'pending', 'pending'],
        });
    });

    it('always shows five chronological form slots, including absences and pending matches', () => {
        const recentSnapshot = {
            players: [
                { id: 'ana', name: 'Ana' },
                { id: 'bea', name: 'Bea' },
            ],
            matches: Array.from({ length: 6 }, (_, index) => ({
                id: `m${6 - index}`,
                teamAScore: index % 2,
                teamBScore: 0,
                teamAPenaltyScore: null,
                teamBPenaltyScore: null,
                participants: index === 1
                    ? [{ player_id: 'bea', team: 'A', was_goalkeeper: false }]
                    : [{ player_id: 'ana', team: 'A', was_goalkeeper: false }],
                goals: [],
            })),
        };

        const ana = calculatePlayerStats(recentSnapshot)
            .find((item) => item.player.id === 'ana');

        expect(ana.recentForm).toHaveLength(5);
        expect(ana.recentForm).toEqual(['draw', 'win', 'draw', 'none', 'draw']);
    });

    it('shows five pending slots before any match has been played', () => {
        const stats = calculatePlayerStats({
            players: [{ id: 'ana', name: 'Ana' }],
            matches: [],
        });

        expect(stats[0].recentForm).toEqual([
            'pending',
            'pending',
            'pending',
            'pending',
            'pending',
        ]);
    });

    it('does not award own goals to the scorer and leaves non-keepers without conceded metrics', () => {
        const ownGoalSnapshot = {
            players: [{ id: 'ana', name: 'Ana' }],
            matches: [{
                id: 'own',
                teamAScore: 0,
                teamBScore: 1,
                teamAPenaltyScore: null,
                teamBPenaltyScore: null,
                participants: [{ player_id: 'ana', team: 'A', was_goalkeeper: false }],
                goals: [{
                    player_id: 'ana',
                    goalkeeper_id: 'ana',
                    count: 1,
                    is_own_goal: true,
                }],
            }],
        };

        expect(calculatePlayerStats(ownGoalSnapshot)[0]).toMatchObject({
            goals: 0,
            goalkeeperMatches: 0,
            goalsAgainst: null,
            goalsAgainstPerMatch: null,
            assignedGoalsAgainst: null,
        });
    });

    it('does not need a goalkeeper on each goal to calculate goalkeeper performance', () => {
        const stats = calculatePlayerStats({
            players: [
                { id: 'ana', name: 'Ana' },
                { id: 'bea', name: 'Bea' },
                { id: 'carla', name: 'Carla' },
            ],
            matches: [{
                id: 'without-goalkeeper-attribution',
                teamAScore: 3,
                teamBScore: 0,
                teamAPenaltyScore: null,
                teamBPenaltyScore: null,
                participants: [
                    { player_id: 'ana', team: 'A', was_goalkeeper: false },
                    { player_id: 'bea', team: 'B', was_goalkeeper: true },
                    { player_id: 'carla', team: 'B', was_goalkeeper: true },
                ],
                goals: [{
                    player_id: 'ana',
                    team: 'A',
                    count: 3,
                    is_own_goal: false,
                }],
            }],
        });

        const bea = stats.find((item) => item.player.id === 'bea');
        const carla = stats.find((item) => item.player.id === 'carla');

        expect(bea).toMatchObject({
            goalsAgainst: 1.5,
            assignedGoalsAgainst: 1.5,
            totalPerformance: 1.5,
        });
        expect(carla).toMatchObject({
            goalsAgainst: 1.5,
            assignedGoalsAgainst: 1.5,
            totalPerformance: 1.5,
        });
    });
});
