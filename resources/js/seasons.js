export function normalizeSeasons(seasons) {
    return (seasons || []).map((season) => ({
        id: Number(season.id),
        number: Number(season.season_number),
        name: season.name,
        isCurrent: Boolean(season.is_current),
        matchCount: Number(season.match_count),
    })).sort((a, b) => b.number - a.number);
}

export function resolveSeasonId(seasons, requestedSeasonId = null) {
    return seasons.find((season) => season.id === requestedSeasonId)?.id
        ?? seasons.find((season) => season.isCurrent)?.id
        ?? seasons[0]?.id
        ?? null;
}
