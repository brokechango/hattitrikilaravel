export const MAX_RANDOMIZER_TEAMS = 6;

export function resolveRandomizerSetup(selectedPlayers, teamCount) {
    const selected = Math.max(0, Number(selectedPlayers) || 0);
    const teams = Math.max(2, Math.min(
        MAX_RANDOMIZER_TEAMS,
        Number(teamCount) || 2,
    ));
    const canGenerate = selected >= 2 && teams <= selected;
    const minimumPerTeam = canGenerate ? Math.floor(selected / teams) : 0;
    const maximumPerTeam = canGenerate ? Math.ceil(selected / teams) : 0;

    let message = '';
    if (selected === 0) message = 'Selecciona al menos dos jugadores para preparar el sorteo.';
    else if (selected === 1) message = 'Selecciona un jugador más para poder formar equipos.';
    else if (teams > selected) message = 'El número de equipos no puede superar al de jugadores.';
    else if (selected % teams) message = 'El reparto tendrá equipos con un jugador de diferencia.';
    else message = 'Todos los equipos tendrán el mismo número de jugadores.';

    return {
        canGenerate,
        maximumPerTeam,
        message,
        minimumPerTeam,
        perTeamLabel: minimumPerTeam === maximumPerTeam
            ? String(minimumPerTeam)
            : `${minimumPerTeam}–${maximumPerTeam}`,
        teams,
    };
}

export function availableRandomizerTeamCounts() {
    return Array.from(
        { length: MAX_RANDOMIZER_TEAMS - 1 },
        (_, index) => index + 2,
    );
}
