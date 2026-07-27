export function collectDisabledMvpMatchIds(rows) {
    return new Set((rows || []).map((row) => row.match_id));
}

export function resolveMatchMvpPlayerId(rows, matchId) {
    const matchVotes = (rows || [])
        .filter((row) => row.match_id === matchId)
        .map((row) => ({
            playerId: row.nominee_player_id,
            votes: Number(row.vote_count) || 0,
        }))
        .filter((row) => row.playerId && row.votes > 0);

    if (!matchVotes.length) return null;

    const highestVoteCount = Math.max(...matchVotes.map((row) => row.votes));
    const leaders = matchVotes.filter((row) => row.votes === highestVoteCount);

    return leaders.length === 1 ? leaders[0].playerId : null;
}

export function resolveMvpVotingAccess(
    matchId,
    currentPlayerId,
    participantIds,
    disabledMatchIds,
) {
    const votingEnabled = !disabledMatchIds.has(matchId);
    const eligible = votingEnabled && Boolean(
        currentPlayerId && participantIds.includes(currentPlayerId),
    );

    return { votingEnabled, eligible };
}
