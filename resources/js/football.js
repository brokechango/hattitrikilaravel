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

    if (match.teamAPenaltyScore != null && match.teamBPenaltyScore != null) {
        return match.teamAPenaltyScore > match.teamBPenaltyScore ? 'A' : 'B';
    }

    return null;
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
const ELO_K_FACTOR = 24;
const GOAL_ELO_IMPACT = 2;
const OWN_GOAL_ELO_IMPACT = 3;
const FORM_MATCH_WEIGHTS = [1, 0.8, 0.6, 0.4, 0.2];

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

function calculatePlayerFormMetrics(snapshot) {
    const matches = snapshot.matches || [];
    const players = snapshot.players || [];
    const ratings = new Map(players.map((player) => [player.id, INITIAL_ELO_RATING]));
    const impactsByMatch = new Map();

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
        const participantIds = new Set([
            ...teamPlayers.A,
            ...teamPlayers.B,
        ]);

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
                ownGoals,
                result,
            });
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
        let latestFormImpact = 0;

        recentMatches.forEach((match, index) => {
            const performance = impactsByMatch.get(match)?.get(player.id);

            if (!performance) {
                return;
            }

            if (index === 0) {
                latestFormImpact = performance.impact;
            }

            formScore += performance.impact * FORM_MATCH_WEIGHTS[index];
            formMatches += 1;
            formGoals += performance.goals;
            formOwnGoals += performance.ownGoals;

            if (performance.result === 'win') formWins += 1;
            else if (performance.result === 'draw') formDraws += 1;
            else formLosses += 1;
        });

        return [player.id, {
            eloRating: ratings.get(player.id) ?? INITIAL_ELO_RATING,
            formDraws,
            formGoals,
            formLosses,
            formMatches,
            formOwnGoals,
            formScore: Math.abs(formScore) < Number.EPSILON ? 0 : formScore,
            formWins,
            isFormEligible: formMatches > 0 && formMatches >= requiredMatches,
            latestFormImpact,
        }];
    }));
}

export function calculatePlayerStats(snapshot) {
    const matches = snapshot.matches;
    const goalkeeperShare = {};
    const formMetrics = calculatePlayerFormMetrics(snapshot);

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

            return participant.team === winner ? 'win' : 'loss';
        });
        const wins = results.filter((result) => result === 'win').length;
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

            return participant.team === winner ? 'win' : 'loss';
        });
        recentForm.push(...Array(5 - recentForm.length).fill('pending'));

        return {
            player,
            matchesPlayed: played.length,
            wins,
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

    for (let index = selected.length - 1; index > 0; index -= 1) {
        const target = Math.floor(random() * (index + 1));
        [selected[index], selected[target]] = [selected[target], selected[index]];
    }

    const minimumStatsScore = Math.min(
        0,
        ...selected.map((player) => player.statsScore),
    );

    for (const player of selected) {
        player.balanceScore = player.statsScore - minimumStatsScore;
    }

    selected.sort((a, b) => Number(b.has_cardio) - Number(a.has_cardio)
        || (balanceStats ? b.balanceScore - a.balanceScore : 0));

    const extraPlayerTeams = selected.length % teamCount;
    const teams = Array.from({ length: teamCount }, (_, index) => ({
        balanceScore: 0,
        capacity: Math.floor(selected.length / teamCount)
            + (index < extraPlayerTeams ? 1 : 0),
        cardioPlayers: 0,
        players: [],
    }));

    for (const player of selected) {
        let candidates = teams.filter((team) => team.players.length < team.capacity);

        if (player.has_cardio) {
            const minimumCardio = Math.min(
                ...candidates.map((team) => team.cardioPlayers),
            );
            candidates = candidates
                .filter((team) => team.cardioPlayers === minimumCardio);
        }

        if (balanceStats) {
            const minimumScore = Math.min(
                ...candidates.map((team) => team.balanceScore),
            );
            candidates = candidates
                .filter((team) => team.balanceScore === minimumScore);
        }

        const minimumSize = Math.min(
            ...candidates.map((team) => team.players.length),
        );
        candidates = candidates
            .filter((team) => team.players.length === minimumSize);

        const team = candidates[Math.floor(random() * candidates.length)];
        team.players.push(player);
        team.balanceScore += player.balanceScore;

        if (player.has_cardio) {
            team.cardioPlayers += 1;
        }
    }

    return teams.map((team) => team.players);
}
