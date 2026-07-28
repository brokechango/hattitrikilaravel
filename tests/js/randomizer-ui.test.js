import { describe, expect, it } from 'vitest';
import {
    availableRandomizerTeamCounts,
    resolveRandomizerSetup,
} from '../../resources/js/randomizer-ui';

describe('team generator UI', () => {
    it('describes an even distribution', () => {
        expect(resolveRandomizerSetup(12, 2)).toMatchObject({
            canGenerate: true,
            perTeamLabel: '6',
            message: 'Todos los equipos tendrán el mismo número de jugadores.',
        });
    });

    it('describes an uneven but valid distribution', () => {
        expect(resolveRandomizerSetup(11, 2)).toMatchObject({
            canGenerate: true,
            perTeamLabel: '5–6',
            message: 'El reparto tendrá equipos con un jugador de diferencia.',
        });
    });

    it('prevents drawing without enough selected players', () => {
        expect(resolveRandomizerSetup(1, 2)).toMatchObject({
            canGenerate: false,
            perTeamLabel: '0',
            message: 'Selecciona un jugador más para poder formar equipos.',
        });
        expect(resolveRandomizerSetup(3, 4)).toMatchObject({
            canGenerate: false,
            message: 'El número de equipos no puede superar al de jugadores.',
        });
    });

    it('keeps the two-to-six team control stable while invalid choices are disabled in the UI', () => {
        expect(availableRandomizerTeamCounts()).toEqual([2, 3, 4, 5, 6]);
    });
});
