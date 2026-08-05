export function toHex(value) {
    return [...new TextEncoder().encode(value)]
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
}

export function fromHex(value) {
    if (!/^(?:[0-9a-f]{2})+$/i.test(value || '')) {
        return '';
    }

    const bytes = new Uint8Array(
        value.match(/.{2}/g).map((item) => Number.parseInt(item, 16)),
    );

    return new TextDecoder().decode(bytes);
}

export function matchWinner(match) {
    if (match.teamAScore > match.teamBScore) {
        return 'A';
    }

    if (match.teamBScore > match.teamAScore) {
        return 'B';
    }

    if (
        match.teamAPenaltyScore != null
        && match.teamBPenaltyScore != null
        && match.teamAPenaltyScore !== match.teamBPenaltyScore
    ) {
        return match.teamAPenaltyScore > match.teamBPenaltyScore ? 'A' : 'B';
    }

    return null;
}

export function isPenaltyShootout(match) {
    return match.teamAScore === match.teamBScore
        && match.teamAPenaltyScore != null
        && match.teamBPenaltyScore != null
        && match.teamAPenaltyScore !== match.teamBPenaltyScore;
}

export function aggregateGoals(goals, participants = []) {
    return [...(goals || [])
        .filter((goal) => Number(goal.count) > 0)
        .reduce((entries, goal) => {
            const team = goal.team
                || participants.find(
                    (participant) => participant.player_id === goal.player_id,
                )?.team
                || 'A';
            const ownGoal = Boolean(goal.is_own_goal);
            const key = `${goal.player_id}:${team}:${ownGoal}`;
            const current = entries.get(key);

            if (current) {
                current.count += Number(goal.count);
            } else {
                const { goalkeeper_id: omittedGoalkeeperId, ...scorerGoal } = goal;
                entries.set(key, {
                    ...scorerGoal,
                    team,
                    count: Number(goal.count),
                });
            }

            return entries;
        }, new Map())
        .values()];
}

export function countMvpVotes(voteRows) {
    return (voteRows || []).reduce((counts, row) => {
        const playerId = row.nominee_player_id;

        if (playerId) {
            counts[playerId] = (counts[playerId] || 0) + Number(row.vote_count || 0);
        }

        return counts;
    }, {});
}

export function isGoalsPerMatchEligible(matchesPlayed, seasonMatchesPlayed) {
    return seasonMatchesPlayed > 0 && matchesPlayed * 2 >= seasonMatchesPlayed;
}

const INITIAL_ELO_RATING = 1000;
// Keep short seasons from swinging too sharply after a single result.
const ELO_K_FACTOR = 16;
const GOAL_ELO_IMPACT = 2;
const OWN_GOAL_ELO_IMPACT = 3;
const FORM_MATCH_WEIGHTS = [1, 0.9, 0.8, 0.7, 0.6];
// Unanimous MVP support equals 1.5 goals and stays below half an even-match win.
export const MVP_MAX_MATCH_IMPACT = 3;

export const PLAYER_PERFORMANCE_SCOPES = Object.freeze({
    STREAK: 'streak',
    HISTORICAL: 'historical',
});

export function playerPerformanceScore(stats, scope = PLAYER_PERFORMANCE_SCOPES.STREAK) {
    const value = scope === PLAYER_PERFORMANCE_SCOPES.HISTORICAL
        ? stats?.historicalScore
        : stats?.formScore;

    return Number(value) || 0;
}

function teamAverageRating(playerIds, ratings) {
    if (!playerIds.size) {
        return INITIAL_ELO_RATING;
    }

    return [...playerIds].reduce(
        (total, playerId) => total + (ratings.get(playerId) ?? INITIAL_ELO_RATING),
        0,
    ) / playerIds.size;
}

function expectedEloScore(rating, opponentRating) {
    return 1 / (1 + (10 ** ((opponentRating - rating) / 400)));
}

function matchEloScores(match) {
    if (match.teamAScore > match.teamBScore) {
        return { A: 1, B: 0 };
    }

    if (match.teamBScore > match.teamAScore) {
        return { A: 0, B: 1 };
    }

    if (
        match.teamAPenaltyScore != null
        && match.teamBPenaltyScore != null
        && match.teamAPenaltyScore !== match.teamBPenaltyScore
    ) {
        return match.teamAPenaltyScore > match.teamBPenaltyScore
            ? { A: 0.75, B: 0.25 }
            : { A: 0.25, B: 0.75 };
    }

    return { A: 0.5, B: 0.5 };
}

function calculatePlayerFormMetrics(snapshot, mvpVotes) {
    const matches = snapshot.matches || [];
    const players = snapshot.players || [];
    const ratings = new Map(players.map((player) => [player.id, INITIAL_ELO_RATING]));
    const impactsByMatch = new Map();
    const historicalMvpVotes = new Map(players.map((player) => [player.id, 0]));
    const historicalMvpScore = new Map(players.map((player) => [player.id, 0]));
    const mvpVotesByMatch = new Map();

    for (const row of mvpVotes || []) {
        const matchId = row.match_id;
        const playerId = row.nominee_player_id;
        const voteCount = Number(row.vote_count) || 0;

        if (!matchId || !playerId || voteCount <= 0) continue;

        const matchVotes = mvpVotesByMatch.get(matchId) || new Map();
        matchVotes.set(playerId, (matchVotes.get(playerId) || 0) + voteCount);
        mvpVotesByMatch.set(matchId, matchVotes);
    }

    for (const match of [...matches].reverse()) {
        const teamPlayers = { A: new Set(), B: new Set() };

        for (const participant of match.participants || []) {
            if (teamPlayers[participant.team]) {
                teamPlayers[participant.team].add(participant.player_id);
            }

            if (!ratings.has(participant.player_id)) {
                ratings.set(participant.player_id, INITIAL_ELO_RATING);
            }
        }

        const teamRatings = {
            A: teamAverageRating(teamPlayers.A, ratings),
            B: teamAverageRating(teamPlayers.B, ratings),
        };
        const expectedScores = {
            A: expectedEloScore(teamRatings.A, teamRatings.B),
            B: expectedEloScore(teamRatings.B, teamRatings.A),
        };
        const actualScores = matchEloScores(match);
        const teamDeltas = {
            A: ELO_K_FACTOR * (actualScores.A - expectedScores.A),
            B: ELO_K_FACTOR * (actualScores.B - expectedScores.B),
        };
        const matchImpacts = new Map();
        const matchMvpVotes = mvpVotesByMatch.get(match.id) || new Map();
        const participantIds = new Set([
            ...teamPlayers.A,
            ...teamPlayers.B,
        ]);
        const possibleMvpVotes = Math.max(1, participantIds.size - 1);

        for (const playerId of participantIds) {
            const playerParticipations = (match.participants || [])
                .filter((participant) => participant.player_id === playerId);
            const playerTeams = new Set(
                playerParticipations.map((participant) => participant.team),
            );
            const playerTeam = playerTeams.size === 1
                ? [...playerTeams][0]
                : null;
            const goals = (match.goals || [])
                .filter((goal) => goal.player_id === playerId && !goal.is_own_goal)
                .reduce((total, goal) => total + Number(goal.count || 0), 0);
            const ownGoals = (match.goals || [])
                .filter((goal) => goal.player_id === playerId && goal.is_own_goal)
                .reduce((total, goal) => total + Number(goal.count || 0), 0);
            const playerMvpVotes = matchMvpVotes.get(playerId) || 0;
            const mvpImpact = Math.min(playerMvpVotes / possibleMvpVotes, 1)
                * MVP_MAX_MATCH_IMPACT;
            const teamImpact = playerTeam ? teamDeltas[playerTeam] : 0;
            const impact = teamImpact + goals * GOAL_ELO_IMPACT
                - ownGoals * OWN_GOAL_ELO_IMPACT;
            const winner = matchWinner(match);
            const result = !playerTeam || !winner
                ? 'draw'
                : playerTeam === winner ? 'win' : 'loss';

            ratings.set(
                playerId,
                (ratings.get(playerId) ?? INITIAL_ELO_RATING) + impact,
            );
            matchImpacts.set(playerId, {
                goals,
                impact,
                mvpImpact,
                mvpVotes: playerMvpVotes,
                ownGoals,
                result,
            });

            if (playerMvpVotes) {
                historicalMvpVotes.set(
                    playerId,
                    (historicalMvpVotes.get(playerId) || 0) + playerMvpVotes,
                );
                historicalMvpScore.set(
                    playerId,
                    (historicalMvpScore.get(playerId) || 0) + mvpImpact,
                );
            }
        }

        impactsByMatch.set(match, matchImpacts);
    }

    const recentMatches = matches.slice(0, FORM_MATCH_WEIGHTS.length);
    const requiredMatches = Math.min(2, recentMatches.length);

    return new Map(players.map((player) => {
        let formScore = 0;
        let formMatches = 0;
        let formGoals = 0;
        let formOwnGoals = 0;
        let formWins = 0;
        let formDraws = 0;
        let formLosses = 0;
        let formMvpVotes = 0;
        let latestFormImpact = 0;

        recentMatches.forEach((match, index) => {
            const performance = impactsByMatch.get(match)?.get(player.id);

            if (!performance) {
                return;
            }

            if (index === 0) {
                latestFormImpact = performance.impact
                    + performance.mvpImpact;
            }

            formScore += (
                performance.impact
                    + performance.mvpImpact
            ) * FORM_MATCH_WEIGHTS[index];
            formMatches += 1;
            formGoals += performance.goals;
            formMvpVotes += performance.mvpVotes;
            formOwnGoals += performance.ownGoals;

            if (performance.result === 'win') formWins += 1;
            else if (performance.result === 'draw') formDraws += 1;
            else formLosses += 1;
        });

        const eloRating = ratings.get(player.id) ?? INITIAL_ELO_RATING;
        const historicalMvpVoteCount = historicalMvpVotes.get(player.id) || 0;
        const historicalScore = eloRating - INITIAL_ELO_RATING
            + (historicalMvpScore.get(player.id) || 0);

        return [player.id, {
            eloRating,
            formDraws,
            formGoals,
            formLosses,
            formMatches,
            formMvpVotes,
            formOwnGoals,
            formScore: Math.abs(formScore) < Number.EPSILON ? 0 : formScore,
            formWins,
            isFormEligible: formMatches > 0 && formMatches >= requiredMatches,
            historicalScore: Math.abs(historicalScore) < Number.EPSILON
                ? 0
                : historicalScore,
            historicalMvpVotes: historicalMvpVoteCount,
            historicalMvpScore: historicalMvpScore.get(player.id) || 0,
            latestFormImpact,
        }];
    }));
}

export function calculatePlayerStats(snapshot, mvpVotes = []) {
    const matches = snapshot.matches;
    const goalkeeperShare = {};
    const formMetrics = calculatePlayerFormMetrics(snapshot, mvpVotes);

    for (const match of matches) {
        for (const team of ['A', 'B']) {
            const keepers = [...new Set(
                match.participants
                    .filter((participant) => participant.team === team && participant.was_goalkeeper)
                    .map((participant) => participant.player_id),
            )];
            const conceded = team === 'A' ? match.teamBScore : match.teamAScore;

            for (const keeper of keepers) {
                goalkeeperShare[keeper] =
                    (goalkeeperShare[keeper] || 0) + conceded / keepers.length;
            }
        }
    }

    return snapshot.players.map((player) => {
        const played = matches.filter((match) =>
            match.participants.some((participant) => participant.player_id === player.id),
        );
        const results = played.map((match) => {
            const participant = match.participants
                .find((entry) => entry.player_id === player.id);
            const winner = matchWinner(match);

            if (!winner) {
                return 'draw';
            }

            if (participant.team !== winner) {
                return 'loss';
            }

            return isPenaltyShootout(match) ? 'penalty-win' : 'win';
        });
        const regularWins = results.filter((result) => result === 'win').length;
        const penaltyWins = results.filter((result) => result === 'penalty-win').length;
        const wins = regularWins + penaltyWins;
        const draws = results.filter((result) => result === 'draw').length;
        const goals = matches.reduce(
            (total, match) => total + match.goals
                .filter((goal) => goal.player_id === player.id && !goal.is_own_goal)
                .reduce((sum, goal) => sum + Number(goal.count || 0), 0),
            0,
        );
        const goalkeeperMatches = played.filter((match) =>
            match.participants.some(
                (participant) => participant.player_id === player.id && participant.was_goalkeeper,
            ),
        ).length;
        const goalsAgainst = goalkeeperMatches ? goalkeeperShare[player.id] || 0 : null;
        const goalkeeperAdjustment = goalsAgainst == null
            ? 0
            : Math.max(0, goalkeeperMatches * 2 - goalsAgainst);
        const recentForm = matches.slice(0, 5).reverse().map((match) => {
            const participant = match.participants
                .find((entry) => entry.player_id === player.id);

            if (!participant) {
                return 'none';
            }

            const winner = matchWinner(match);

            if (!winner) {
                return 'draw';
            }

            if (participant.team !== winner) {
                return 'loss';
            }

            return isPenaltyShootout(match) ? 'penalty-win' : 'win';
        });
        recentForm.push(...Array(5 - recentForm.length).fill('pending'));

        return {
            player,
            matchesPlayed: played.length,
            wins,
            regularWins,
            penaltyWins,
            draws,
            losses: played.length - wins - draws,
            goals,
            goalkeeperMatches,
            goalsAgainst,
            goalsPerMatch: goals / Math.max(played.length, 1),
            goalsAgainstPerMatch: goalsAgainst == null
                ? null
                : goalsAgainst / Math.max(goalkeeperMatches, 1),
            assignedGoalsAgainst: goalsAgainst,
            totalPerformance: played.length + goals + wins + goalkeeperAdjustment,
            recentForm,
            ...formMetrics.get(player.id),
        };
    });
}

const TEAM_BALANCE_EPSILON = 1e-9;

function emptyTeamBuckets(capacities) {
    return capacities.map((capacity) => ({
        capacity,
        cardioPlayers: 0,
        players: [],
        score: 0,
    }));
}

function refreshTeamBucket(team) {
    team.score = team.players.reduce((total, player) => total + player.statsScore, 0);
    team.cardioPlayers = team.players.filter((player) => player.has_cardio).length;
}

function teamBalanceObjective(teams, balanceStats) {
    const scores = teams.map((team) => team.score);
    const cardio = teams.map((team) => team.cardioPlayers);
    const scoreAverage = scores.reduce((total, score) => total + score, 0) / scores.length;
    const cardioAverage = cardio.reduce((total, count) => total + count, 0) / cardio.length;
    const scoreMetrics = [
        Math.max(...scores) - Math.min(...scores),
        scores.reduce((total, score) => total + ((score - scoreAverage) ** 2), 0),
    ];
    const cardioMetrics = [
        Math.max(...cardio) - Math.min(...cardio),
        cardio.reduce((total, count) => total + ((count - cardioAverage) ** 2), 0),
    ];

    return balanceStats ? [...scoreMetrics, ...cardioMetrics] : cardioMetrics;
}

function objectiveIsBetter(candidate, current) {
    if (!current) return true;

    for (let index = 0; index < candidate.length; index += 1) {
        const difference = candidate[index] - current[index];
        if (Math.abs(difference) <= TEAM_BALANCE_EPSILON) continue;
        return difference < 0;
    }

    return false;
}

function objectivesAreEqual(left, right) {
    return Boolean(right)
        && left.length === right.length
        && left.every((value, index) => Math.abs(value - right[index]) <= TEAM_BALANCE_EPSILON);
}

function playersFromBuckets(teams) {
    return teams.map((team) => [...team.players]);
}

function exactTwoTeamBalance(players, capacities, random) {
    const firstCapacity = capacities[0];
    const totalScore = players.reduce((total, player) => total + player.statsScore, 0);
    const totalCardio = players.filter((player) => player.has_cardio).length;
    let bestSelection = [];
    let bestObjective = null;
    let equivalentSolutions = 0;
    const selected = [];

    function search(nextIndex, remaining, score, cardio) {
        if (!remaining) {
            const objective = [
                Math.abs(score - (totalScore - score)),
                Math.abs(cardio - (totalCardio - cardio)),
            ];

            if (objectiveIsBetter(objective, bestObjective)) {
                bestObjective = objective;
                bestSelection = [...selected];
                equivalentSolutions = 1;
            } else if (objectivesAreEqual(objective, bestObjective)) {
                equivalentSolutions += 1;
                if (random() < 1 / equivalentSolutions) bestSelection = [...selected];
            }
            return;
        }

        if (players.length - nextIndex < remaining) return;

        for (let index = nextIndex; index <= players.length - remaining; index += 1) {
            const player = players[index];
            selected.push(index);
            search(
                index + 1,
                remaining - 1,
                score + player.statsScore,
                cardio + Number(Boolean(player.has_cardio)),
            );
            selected.pop();
        }
    }

    if (capacities[0] === capacities[1]) {
        selected.push(0);
        search(
            1,
            firstCapacity - 1,
            players[0].statsScore,
            Number(Boolean(players[0].has_cardio)),
        );
        selected.pop();
    } else {
        search(0, firstCapacity, 0, 0);
    }
    const firstTeamIndexes = new Set(bestSelection);
    const teams = [[], []];
    players.forEach((player, index) => {
        teams[firstTeamIndexes.has(index) ? 0 : 1].push(player);
    });

    return teams;
}

function exactTeamBalance(players, capacities, balanceStats, random) {
    const ordered = [...players]
        .sort((a, b) => Math.abs(b.statsScore) - Math.abs(a.statsScore));
    const teams = emptyTeamBuckets(capacities);
    let bestTeams = null;
    let bestObjective = null;
    let equivalentSolutions = 0;

    function search(playerIndex) {
        if (playerIndex === ordered.length) {
            const objective = teamBalanceObjective(teams, balanceStats);
            if (objectiveIsBetter(objective, bestObjective)) {
                bestObjective = objective;
                bestTeams = structuredClone(teams);
                equivalentSolutions = 1;
            } else if (objectivesAreEqual(objective, bestObjective)) {
                equivalentSolutions += 1;
                if (random() < 1 / equivalentSolutions) bestTeams = structuredClone(teams);
            }
            return;
        }

        const player = ordered[playerIndex];
        const seenStates = new Set();
        teams.forEach((team, teamIndex) => {
            if (team.players.length >= team.capacity) return;
            const state = [
                team.capacity,
                team.players.length,
                team.score.toFixed(9),
                team.cardioPlayers,
            ].join('|');
            if (seenStates.has(state)) return;
            seenStates.add(state);

            team.players.push(player);
            team.score += player.statsScore;
            team.cardioPlayers += Number(Boolean(player.has_cardio));
            search(playerIndex + 1);
            team.players.pop();
            team.score -= player.statsScore;
            team.cardioPlayers -= Number(Boolean(player.has_cardio));
        });
    }

    search(0);
    return bestTeams ? playersFromBuckets(bestTeams) : null;
}

function occupancySpread(teams) {
    const occupancy = teams.map((team) => team.players.length / team.capacity);
    return Math.max(...occupancy) - Math.min(...occupancy);
}

function improveTeamsBySwapping(teams, balanceStats) {
    for (let iteration = 0; iteration < 100; iteration += 1) {
        let bestObjective = teamBalanceObjective(teams, balanceStats);
        let bestSwap = null;

        for (let firstTeam = 0; firstTeam < teams.length - 1; firstTeam += 1) {
            for (let secondTeam = firstTeam + 1; secondTeam < teams.length; secondTeam += 1) {
                teams[firstTeam].players.forEach((firstPlayer, firstIndex) => {
                    teams[secondTeam].players.forEach((secondPlayer, secondIndex) => {
                        const candidate = structuredClone(teams);
                        candidate[firstTeam].players[firstIndex] = secondPlayer;
                        candidate[secondTeam].players[secondIndex] = firstPlayer;
                        refreshTeamBucket(candidate[firstTeam]);
                        refreshTeamBucket(candidate[secondTeam]);
                        const objective = teamBalanceObjective(candidate, balanceStats);
                        if (objectiveIsBetter(objective, bestObjective)) {
                            bestObjective = objective;
                            bestSwap = [firstTeam, firstIndex, secondTeam, secondIndex];
                        }
                    });
                });
            }
        }

        if (!bestSwap) break;
        const [firstTeam, firstIndex, secondTeam, secondIndex] = bestSwap;
        const firstPlayer = teams[firstTeam].players[firstIndex];
        teams[firstTeam].players[firstIndex] = teams[secondTeam].players[secondIndex];
        teams[secondTeam].players[secondIndex] = firstPlayer;
        refreshTeamBucket(teams[firstTeam]);
        refreshTeamBucket(teams[secondTeam]);
    }

    return teams;
}

function shufflePlayers(players, random) {
    const shuffled = [...players];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
        const target = Math.floor(random() * (index + 1));
        [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
    }
    return shuffled;
}

function heuristicTeamBalance(players, capacities, balanceStats, random) {
    const attempts = Math.min(48, Math.max(12, players.length * 2));
    let bestTeams = null;
    let bestObjective = null;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
        const ordered = attempt
            ? shufflePlayers(players, random)
            : [...players].sort((a, b) => Math.abs(b.statsScore) - Math.abs(a.statsScore));
        let teams = emptyTeamBuckets(capacities);

        for (const player of ordered) {
            let candidateIndex = null;
            let candidateObjective = null;

            teams.forEach((team, teamIndex) => {
                if (team.players.length >= team.capacity) return;
                const candidate = structuredClone(teams);
                candidate[teamIndex].players.push(player);
                candidate[teamIndex].score += player.statsScore;
                candidate[teamIndex].cardioPlayers += Number(Boolean(player.has_cardio));
                const objective = [
                    ...teamBalanceObjective(candidate, balanceStats),
                    occupancySpread(candidate),
                ];
                if (objectiveIsBetter(objective, candidateObjective)) {
                    candidateIndex = teamIndex;
                    candidateObjective = objective;
                }
            });

            if (candidateIndex == null) continue;
            teams[candidateIndex].players.push(player);
            teams[candidateIndex].score += player.statsScore;
            teams[candidateIndex].cardioPlayers += Number(Boolean(player.has_cardio));
        }

        teams = improveTeamsBySwapping(teams, balanceStats);
        const objective = teamBalanceObjective(teams, balanceStats);
        if (
            objectiveIsBetter(objective, bestObjective)
            || (objectivesAreEqual(objective, bestObjective) && random() < 0.5)
        ) {
            bestTeams = teams;
            bestObjective = objective;
        }
    }

    return playersFromBuckets(bestTeams || emptyTeamBuckets(capacities));
}

export function generateBalancedTeams(players, teamCount, options = {}) {
    if (
        !Array.isArray(players)
        || !players.length
        || !Number.isInteger(teamCount)
        || teamCount < 2
        || teamCount > players.length
    ) {
        return [];
    }

    const balanceStats = Boolean(options.balanceStats);
    const random = typeof options.random === 'function' ? options.random : Math.random;
    const selected = players.map((player) => ({
        ...player,
        statsScore: Number(player.statsScore) || 0,
    }));
    const extraPlayerTeams = selected.length % teamCount;
    const capacities = Array.from(
        { length: teamCount },
        (_, index) => Math.floor(selected.length / teamCount)
            + Number(index < extraPlayerTeams),
    );

    if (balanceStats && teamCount === 2 && selected.length <= 22) {
        return exactTwoTeamBalance(selected, capacities, random);
    }

    if (selected.length <= 12) {
        const exactTeams = exactTeamBalance(
            selected,
            capacities,
            balanceStats,
            random,
        );
        if (exactTeams) return exactTeams;
    }

    return heuristicTeamBalance(selected, capacities, balanceStats, random);
}
