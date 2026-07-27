export function collectDisabledMvpMatchIds(rows) {
    return new Set((rows || []).map((row) => row.match_id));
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
