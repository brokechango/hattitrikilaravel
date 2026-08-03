import { describe, expect, it } from 'vitest';
import {
    aggregateGoals,
    calculatePlayerStats,
    countMvpVotes,
    fromHex,
    generateBalancedTeams,
    isGoalsPerMatchEligible,
    isPenaltyShootout,
    matchWinner,
    PLAYER_PERFORMANCE_SCOPES,
    playerPerformanceScore,
    toHex,
} from '../../resources/js/football';

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

describe('goal summaries', () => {
    it('groups goals by scorer without exposing goalkeeper attribution', () => {
        const goals = aggregateGoals([
            {
                player_id: 'jon',
                goalkeeper_id: 'arturo',
                count: 1,
                is_own_goal: false,
            },
            {
                player_id: 'jon',
                goalkeeper_id: 'yeray',
                count: 1,
                is_own_goal: false,
            },
            {
                player_id: 'matteo',
                goalkeeper_id: 'yeray',
                count: 2,
                is_own_goal: false,
            },
        ], [
            { player_id: 'jon', team: 'B' },
            { player_id: 'matteo', team: 'B' },
        ]);

        expect(goals).toHaveLength(2);
        expect(goals.every((goal) => !('goalkeeper_id' in goal))).toBe(true);
        expect(goals).toEqual([
            expect.objectContaining({
                player_id: 'jon',
                team: 'B',
                count: 2,
            }),
            expect.objectContaining({
                player_id: 'matteo',
                team: 'B',
                count: 2,
            }),
        ]);
    });
});

describe('MVP vote totals', () => {
    it('adds the votes received across different matches', () => {
        expect(countMvpVotes([
            { match_id: 'm1', nominee_player_id: 'ana', vote_count: 3 },
            { match_id: 'm2', nominee_player_id: 'ana', vote_count: 2 },
            { match_id: 'm2', nominee_player_id: 'bea', vote_count: 1 },
        ])).toEqual({
            ana: 5,
            bea: 1,
        });
    });
});

describe('goals per match eligibility', () => {
    it('requires at least half of the season matches, rounding up', () => {
        expect(isGoalsPerMatchEligible(2, 4)).toBe(true);
        expect(isGoalsPerMatchEligible(1, 4)).toBe(false);
        expect(isGoalsPerMatchEligible(3, 5)).toBe(true);
        expect(isGoalsPerMatchEligible(2, 5)).toBe(false);
    });

    it('does not include players when the season has no matches', () => {
        expect(isGoalsPerMatchEligible(0, 0)).toBe(false);
    });
});

describe('football calculations', () => {
    it('decides regular and penalty winners', () => {
        expect(matchWinner(snapshot.matches[1])).toBe('A');
        expect(matchWinner(snapshot.matches[0])).toBe('A');
        expect(isPenaltyShootout(snapshot.matches[0])).toBe(true);
        expect(isPenaltyShootout(snapshot.matches[1])).toBe(false);
        expect(matchWinner({ ...snapshot.matches[0], teamAPenaltyScore: null, teamBPenaltyScore: null })).toBeNull();
        expect(matchWinner({ ...snapshot.matches[0], teamAPenaltyScore: 3, teamBPenaltyScore: 3 })).toBeNull();
    });

    it('calculates goals, form and evenly split goalkeeper totals', () => {
        const stats = calculatePlayerStats(snapshot);
        const ana = stats.find((item) => item.player.id === 'ana');
        const bea = stats.find((item) => item.player.id === 'bea');
        const carla = stats.find((item) => item.player.id === 'carla');

        expect(ana).toMatchObject({
            matchesPlayed: 2,
            wins: 2,
            regularWins: 1,
            penaltyWins: 1,
            draws: 0,
            goals: 2,
            goalkeeperMatches: 1,
            goalsAgainst: 0,
            recentForm: ['win', 'penalty-win', 'pending', 'pending', 'pending'],
        });
        expect(bea.goalsAgainst).toBe(1);
        expect(carla.goalsAgainst).toBe(1);
        expect(carla.recentForm).toEqual(['loss', 'none', 'pending', 'pending', 'pending']);
        expect(ana.assignedGoalsAgainst).toBe(0);
        expect(bea.assignedGoalsAgainst).toBe(1);
        expect(carla.assignedGoalsAgainst).toBe(1);
    });

    it('calculates a weighted Elo form that rises and falls over the last five matches', () => {
        const stats = calculatePlayerStats(snapshot);
        const ana = stats.find((item) => item.player.id === 'ana');
        const bea = stats.find((item) => item.player.id === 'bea');
        const carla = stats.find((item) => item.player.id === 'carla');

        expect(ana).toMatchObject({
            formMatches: 2,
            formGoals: 2,
            formWins: 2,
            formDraws: 0,
            formLosses: 0,
            isFormEligible: true,
        });
        expect(ana.formScore).toBeCloseTo(17.835, 3);
        expect(ana.eloRating).toBeCloseTo(1021.035, 3);
        expect(ana.historicalScore).toBeCloseTo(21.035, 3);
        expect(bea.formScore).toBeCloseTo(-14.635, 3);
        expect(bea.eloRating).toBeCloseTo(982.965, 3);
        expect(bea.historicalScore).toBeCloseTo(-17.035, 3);
        expect(carla).toMatchObject({
            formMatches: 1,
            formGoals: 1,
            isFormEligible: false,
        });
    });

    it('exposes streak and historical balancing scores from the ranking calculation', () => {
        const ana = calculatePlayerStats(snapshot)
            .find((item) => item.player.id === 'ana');

        expect(playerPerformanceScore(ana, PLAYER_PERFORMANCE_SCOPES.STREAK))
            .toBeCloseTo(ana.formScore, 10);
        expect(playerPerformanceScore(ana, PLAYER_PERFORMANCE_SCOPES.HISTORICAL))
            .toBeCloseTo(ana.historicalScore, 10);
        expect(playerPerformanceScore(undefined, PLAYER_PERFORMANCE_SCOPES.HISTORICAL))
            .toBe(0);
    });

    it('ignores every goalkeeper field when calculating Elo form', () => {
        const withoutGoalkeepers = {
            ...snapshot,
            matches: snapshot.matches.map((match) => ({
                ...match,
                participants: match.participants.map((participant) => ({
                    ...participant,
                    was_goalkeeper: false,
                })),
            })),
        };
        const original = calculatePlayerStats(snapshot);
        const changed = calculatePlayerStats(withoutGoalkeepers);

        for (const player of snapshot.players) {
            const originalStats = original.find((item) => item.player.id === player.id);
            const changedStats = changed.find((item) => item.player.id === player.id);

            expect(changedStats.formScore).toBeCloseTo(originalStats.formScore, 10);
            expect(changedStats.eloRating).toBeCloseTo(originalStats.eloRating, 10);
        }
    });

    it('subtracts Elo for defeats and adds an extra penalty for own goals', () => {
        const ownGoalStats = calculatePlayerStats({
            players: [
                { id: 'ana', name: 'Ana' },
                { id: 'bea', name: 'Bea' },
            ],
            matches: [{
                id: 'own-goal-loss',
                teamAScore: 1,
                teamBScore: 0,
                teamAPenaltyScore: null,
                teamBPenaltyScore: null,
                participants: [
                    { player_id: 'ana', team: 'A', was_goalkeeper: false },
                    { player_id: 'bea', team: 'B', was_goalkeeper: false },
                ],
                goals: [{
                    player_id: 'bea',
                    team: 'A',
                    count: 1,
                    is_own_goal: true,
                }],
            }],
        });

        expect(ownGoalStats.find((item) => item.player.id === 'ana').formScore)
            .toBe(12);
        expect(ownGoalStats.find((item) => item.player.id === 'bea').formScore)
            .toBe(-15);
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

    it('balances positive and negative Elo form scores without worsening the weaker team', () => {
        const teams = generateBalancedTeams([
            { id: 'a', name: 'A', has_cardio: false, statsScore: 30 },
            { id: 'b', name: 'B', has_cardio: false, statsScore: 10 },
            { id: 'c', name: 'C', has_cardio: false, statsScore: -10 },
            { id: 'd', name: 'D', has_cardio: false, statsScore: -30 },
        ], 2, {
            balanceStats: true,
            random: () => 0,
        });

        expect(teams.map((team) => team.length)).toEqual([2, 2]);
        expect(teams.map((team) =>
            team.reduce((total, player) => total + player.statsScore, 0),
        )).toEqual([0, 0]);
    });

    it('finds an exact real-points split when one exists', () => {
        const teams = generateBalancedTeams(
            [14, 13, 8, 7, 5, 3].map((statsScore, index) => ({
                id: `player-${index}`,
                name: `Player ${index}`,
                has_cardio: false,
                statsScore,
            })),
            2,
            { balanceStats: true, random: () => 0 },
        );
        const scores = teams
            .map((team) => team.reduce((total, player) => total + player.statsScore, 0))
            .sort((a, b) => a - b);

        expect(scores).toEqual([25, 25]);
        expect(teams.map((team) => team.length)).toEqual([3, 3]);
    });

    it('does not shift negative points when team sizes differ', () => {
        const teams = generateBalancedTeams(
            [-100, 50, 40, 30, 20].map((statsScore, index) => ({
                id: `player-${index}`,
                name: `Player ${index}`,
                has_cardio: false,
                statsScore,
            })),
            2,
            { balanceStats: true, random: () => 0 },
        );
        const scores = teams
            .map((team) => team.reduce((total, player) => total + player.statsScore, 0))
            .sort((a, b) => a - b);
        const sizes = teams.map((team) => team.length).sort((a, b) => a - b);

        expect(scores).toEqual([-10, 50]);
        expect(scores[1] - scores[0]).toBe(60);
        expect(sizes).toEqual([2, 3]);
    });

    it('balances cardio only after minimizing the point difference', () => {
        const teams = generateBalancedTeams(
            [0, 1, 2, 3].map((index) => ({
                id: `player-${index}`,
                name: `Player ${index}`,
                has_cardio: index < 2,
                statsScore: 10,
            })),
            2,
            { balanceStats: true, random: () => 0 },
        );

        expect(teams.map((team) =>
            team.reduce((total, player) => total + player.statsScore, 0),
        )).toEqual([20, 20]);
        expect(teams.map((team) => team.filter((player) => player.has_cardio).length))
            .toEqual([1, 1]);
    });

    it('equalizes real points across more than two teams', () => {
        const teams = generateBalancedTeams(
            [9, 8, 7, 6, 5, 4].map((statsScore, index) => ({
                id: `player-${index}`,
                name: `Player ${index}`,
                has_cardio: false,
                statsScore,
            })),
            3,
            { balanceStats: true, random: () => 0 },
        );
        const scores = teams
            .map((team) => team.reduce((total, player) => total + player.statsScore, 0))
            .sort((a, b) => a - b);

        expect(scores).toEqual([13, 13, 13]);
    });
});
