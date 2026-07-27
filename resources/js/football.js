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

export function calculatePlayerStats(snapshot) {
    const matches = snapshot.matches;
    const goalkeeperShare = {};

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
        };
    });
}
