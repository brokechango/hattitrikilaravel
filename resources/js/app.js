import { createClient } from '@supabase/supabase-js';
import {
    aggregateGoals,
    calculatePlayerStats,
    countMvpVotes,
    fromHex,
    generateBalancedTeams,
    isGoalsPerMatchEligible,
    matchWinner,
    toHex,
} from './football';
import { formatFlooredTotal } from './formatters';
import {
    collectDisabledMvpMatchIds,
    resolveMatchMvpPlayerId,
    resolveMvpCandidates,
    resolveMvpVotingAccess,
} from './mvp-voting';
import {
    MOTION_BASE_DURATION_MS,
    MOTION_EXIT_DURATION_MS,
    motionDelay,
    prefersReducedMotion,
    shouldAnimateRoute,
} from './motion';
import {
    canStartPullRefresh,
    PULL_REFRESH_THRESHOLD,
    resolvePullGesture,
} from './pull-to-refresh';
import {
    availableRandomizerTeamCounts,
    MAX_RANDOMIZER_TEAMS,
    resolveRandomizerSetup,
} from './randomizer-ui';
import { normalizeSeasons, resolveSeasonId } from './seasons';
import {
    captureStatCardPointer,
    movedBeyondPressTolerance,
    restoreStatCardScroll,
    shouldBlockStatCardScroll,
} from './stat-card-gesture';
import {
    AVATAR_FAILURE_REFRESH_COOLDOWN_MS,
    AVATAR_REFRESH_INTERVAL_MS,
    AVATAR_SIGNED_URL_TTL_SECONDS,
    avatarRetryDelay,
    mapSignedAvatarUrls,
    shouldRefreshAvatarUrls,
} from './avatar-urls';

const root = document.querySelector('#app');
let pullRefreshBusy = false;
let pullRefreshGesture = null;
let lastRenderedRoute = null;
let authMotionPending = false;
let matchStepMotionPending = false;
let rankingMotionPending = false;
let avatarRefreshTimer = null;
let avatarRefreshPromise = null;
let avatarRefreshGeneration = 0;
let avatarRefreshAttempt = 0;
let lastAvatarFailureRefreshAt = 0;
let profileMotionGeneration = 0;
let profileMotionModule = null;
const config = globalThis.HATTITRIKI_CONFIG ?? {};
const AUTH_BOOT_TIMEOUT_MS = 10_000;
const SUPABASE_REQUEST_TIMEOUT_MS = 15_000;
const AUTH_BOOT_RESET_KEY = 'hattitriki-auth-boot-reset';
const authCallback = new URLSearchParams(location.hash.replace(/^#/, ''));
const callbackType = authCallback.get('type');
const legacyRoute = location.hash.startsWith('#/') ? location.hash.slice(1) : null;

if (legacyRoute) {
    history.replaceState({}, '', `${legacyRoute}${location.search}`);
}
const RANKING_CATEGORY_KEYS = [
    'top-scorer',
    'goals-per-match',
    'most-played',
    'most-wins',
    'player-on-form',
    'people-favourite',
];
const RANKING_SYMBOLS = {
    'top-scorer': '⚽',
    'goals-per-match': '🎯',
    'most-played': '👟',
    'most-wins': '🏆',
    'player-on-form': '🔥',
    'people-favourite': '★',
};

const state = {
    client: null,
    session: null,
    access: null,
    authMode: callbackType === 'invite' ? 'invite' : callbackType === 'recovery' ? 'recovery' : 'login',
    authBusy: false,
    authError: '',
    recoverySentTo: '',
    loading: true,
    loadError: '',
    snapshot: { players: [], matches: [] },
    seasons: [],
    selectedSeasonId: null,
    seasonBusy: false,
    avatars: {},
    avatarRows: [],
    avatarUrlsSignedAt: 0,
    currentPlayerId: null,
    mvpVotes: [],
    mvpVotingDisabledMatchIds: new Set(),
    mvpVotingMatchId: null,
    mvpBusy: false,
    profileDetails: {},
    menuOpen: false,
    menuClosing: false,
    snackbar: null,
    rankingCategory: 'top-scorer',
    rankingView: 'compact',
    rankingFiltersVisible: false,
    homeOrder: (() => {
        try {
            const stored = JSON.parse(localStorage.getItem('hattitriki-home-order') || '[]');
            return Array.isArray(stored) ? stored : [];
        } catch {
            return [];
        }
    })(),
    statReorder: null,
    suppressStatClick: false,
    profileExplanations: false,
    historyFilter: { mode: 'all', month: '', year: '', from: '', to: '' },
    historyControlsVisible: false,
    historyFiltersVisible: false,
    managePlayersFilter: { search: '', status: 'all', order: 'az' },
    manageMatchesFilter: { search: '', type: 'all', order: 'newest' },
    adminPlayers: null,
    adminMatches: null,
    invitationSuccess: null,
    matchDraft: null,
    matchStep: 1,
    randomizer: null,
    randomizerResult: null,
    selectionMotion: null,
    dialog: null,
    unsaved: false,
    lastPath: location.pathname,
};

const ICONS = {
    home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10.5V20h13v-9.5"/><path d="M9.5 20v-6h5v6"/>',
    matches: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/>',
    rankings: '<path d="M8 21h8M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0V4Z"/><path d="M7 6H4v2a4 4 0 0 0 4 4M17 6h3v2a4 4 0 0 1-4 4"/>',
    profile: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    manager: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.8 1.8 0 0 0 .36 1.98l.06.06-2.83 2.83-.06-.06A1.8 1.8 0 0 0 15 19.4a1.8 1.8 0 0 0-1 .6 1.8 1.8 0 0 0-.4 1v.1h-4v-.1a1.8 1.8 0 0 0-1.2-1.6 1.8 1.8 0 0 0-1.98.36l-.06.06-2.83-2.83.06-.06A1.8 1.8 0 0 0 4.6 15a1.8 1.8 0 0 0-.6-1 1.8 1.8 0 0 0-1-.4h-.1v-4H3A1.8 1.8 0 0 0 4.6 8a1.8 1.8 0 0 0-.36-1.98l-.06-.06 2.83-2.83.06.06A1.8 1.8 0 0 0 9 4.6a1.8 1.8 0 0 0 1-.6 1.8 1.8 0 0 0 .4-1v-.1h4V3a1.8 1.8 0 0 0 1.2 1.6 1.8 1.8 0 0 0 1.98-.36l.06-.06 2.83 2.83-.06.06A1.8 1.8 0 0 0 19.4 9c.14.36.35.7.6 1 .27.28.62.42 1 .4h.1v4H21a1.8 1.8 0 0 0-1.6.6Z"/>',
    back: '<path d="m15 18-6-6 6-6"/>',
    menu: '<circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>',
    logout: '<path d="M10 17l5-5-5-5M15 12H3"/><path d="M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5"/>',
    refresh: '<path d="M20 6v5h-5"/><path d="M4 18v-5h5"/><path d="M18.5 9A7 7 0 0 0 6.2 6.2L4 11M5.5 15A7 7 0 0 0 17.8 17.8L20 13"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6M10 11v5M14 11v5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    shuffle: '<path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>',
    userPlus: '<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0M19 8v6M16 11h6"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    camera: '<path d="M14.5 4 16 7h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h3l1.5-3Z"/><circle cx="12" cy="13" r="4"/>',
    football: '<circle cx="12" cy="12" r="9"/><path d="m12 8 3 2-1 4h-4l-1-4ZM6 9 3.5 11M18 9l2.5 2M8 17l-1 3M16 17l1 3"/>',
    mvp: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z"/>',
};

function icon(name, label = '') {
    const title = label ? `<title>${esc(label)}</title>` : '';
    return `<svg aria-hidden="${label ? 'false' : 'true'}" ${label ? `role="img"` : ''} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${title}${ICONS[name] ?? ICONS.info}</svg>`;
}

function esc(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function initials(name) {
    return String(name || '?').trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || '?';
}

function formatDate(iso, long = true) {
    if (!iso) return '';
    const date = new Date(`${iso}T12:00:00`);
    return new Intl.DateTimeFormat('es-ES', long
        ? { day: 'numeric', month: 'long', year: 'numeric' }
        : { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}

function formatDecimal(value) {
    const rounded = Math.round((Number(value) || 0) * 10) / 10;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace('.', ',');
}

function formatSignedDecimal(value) {
    const numericValue = Number(value) || 0;

    if (numericValue > 0) {
        return `+${formatDecimal(numericValue)}`;
    }

    if (numericValue < 0) {
        return `−${formatDecimal(Math.abs(numericValue))}`;
    }

    return '0';
}

function formatPenaltyScore(teamAScore, teamBScore) {
    return `(${teamAScore} - ${teamBScore})`;
}

function currentRoute() {
    const path = location.pathname.replace(/\/+$/, '');
    return path || '/inicio';
}

function navigate(route, replace = false) {
    const target = route.startsWith('/') ? route : `/${route}`;
    if (replace) {
        history.replaceState({}, '', target);
    } else if (location.pathname !== target) {
        history.pushState({}, '', target);
    }
    state.lastPath = target;
    render();
    queueMicrotask(() => document.querySelector('#main-content')?.focus({ preventScroll: true }));
}

function routeTab(route = currentRoute()) {
    if (route.startsWith('/partidos')) return 'matches';
    if (route.startsWith('/rankings')) return 'rankings';
    if (route.startsWith('/perfil')) return 'profile';
    if (route.startsWith('/mister')) return 'manager';
    return 'home';
}

function isAdmin() {
    return state.access?.role?.toLowerCase() === 'admin';
}

function waitForMotion(durationMs = MOTION_EXIT_DURATION_MS) {
    return new Promise((resolve) => {
        window.setTimeout(resolve, motionDelay(durationMs));
    });
}

function showSnackbar(message, error = false) {
    window.clearTimeout(showSnackbar.dismissTimer);
    window.clearTimeout(showSnackbar.removeTimer);
    state.snackbar = { message, error, closing: false };
    render();

    showSnackbar.dismissTimer = window.setTimeout(() => {
        if (!state.snackbar) return;
        if (prefersReducedMotion()) {
            state.snackbar = null;
            render();
            return;
        }

        state.snackbar = { ...state.snackbar, closing: true };
        render();
        showSnackbar.removeTimer = window.setTimeout(() => {
            state.snackbar = null;
            render();
        }, MOTION_EXIT_DURATION_MS);
    }, 3800 - MOTION_EXIT_DURATION_MS);
}

async function closeAccountMenu() {
    if (!state.menuOpen || state.menuClosing) return;
    state.menuClosing = true;
    render();
    await waitForMotion();
    state.menuOpen = false;
    state.menuClosing = false;
    render();
}

async function closeDialog() {
    if (!state.dialog || state.dialog.closing) return;
    if (!prefersReducedMotion()) {
        state.dialog = { ...state.dialog, closing: true };
        render();
        await waitForMotion();
    }
    state.dialog = null;
    render();
}

function errorMessage(error, fallback = 'Ha ocurrido un error. Inténtalo de nuevo.') {
    const text = `${error?.message || ''} ${error?.details || ''}`.toLowerCase();
    if (text.includes('invalid login credentials')) return 'Usuario o contraseña inválidos.';
    if (text.includes('email not confirmed')) return 'Confirma tu correo antes de iniciar sesión.';
    if (text.includes('jwt') || text.includes('permission') || text.includes('42501')) return 'Tu sesión ya no tiene permisos para realizar esta acción.';
    if (text.includes('duplicate') || text.includes('23505')) return 'Ya existe un registro con esos datos.';
    if (text.includes('auth_boot_timeout')) return 'Supabase está tardando demasiado en restaurar la sesión. Usa “Limpiar sesión y reintentar” si el problema continúa.';
    if (text.includes('timeout') || text.includes('abort')) return 'Supabase está tardando demasiado en responder. Inténtalo de nuevo.';
    if (text.includes('failed to fetch') || text.includes('network')) return 'No se ha podido conectar con Supabase. Comprueba tu conexión e inténtalo de nuevo.';
    return fallback;
}

async function withTimeout(promise, timeoutMs, timeoutCode) {
    let timeoutId;

    try {
        return await Promise.race([
            promise,
            new Promise((resolve, reject) => {
                timeoutId = window.setTimeout(() => reject(new Error(timeoutCode)), timeoutMs);
            }),
        ]);
    } finally {
        window.clearTimeout(timeoutId);
    }
}

function clearPersistedAuthSession() {
    let projectReference = '';

    try {
        projectReference = new URL(config.supabaseUrl).hostname.split('.')[0] || '';
    } catch {
        return;
    }

    if (!projectReference) return;

    const storageKey = `sb-${projectReference}-auth-token`;
    window.sessionStorage.removeItem(storageKey);
    window.sessionStorage.removeItem(`${storageKey}-code-verifier`);
}

function kotlinStringHash(value) {
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) {
        hash = ((hash * 31) + value.charCodeAt(index)) | 0;
    }
    return hash;
}

function preferenceKey(prefix) {
    return `${prefix}.${kotlinStringHash(state.access?.email || 'default')}`;
}

function loadUserPreferences() {
    const rankingFields = localStorage.getItem(preferenceKey('rankings.preferences'))?.split('|');
    state.rankingCategory = rankingFields?.length === 2 && RANKING_CATEGORY_KEYS.includes(rankingFields[0])
        ? rankingFields[0]
        : 'top-scorer';
    state.rankingView = rankingFields?.[1] === 'detailed' ? 'detailed' : 'compact';

    const historyFields = localStorage.getItem(preferenceKey('history.filter'))?.split('|');
    state.historyFilter = historyFields?.length === 5
        && ['all', 'month', 'year', 'range'].includes(historyFields[0])
        ? {
            mode: historyFields[0],
            month: historyFields[1],
            year: historyFields[2],
            from: historyFields[3],
            to: historyFields[4],
        }
        : { mode: 'all', month: '', year: '', from: '', to: '' };
}

function saveRankingPreferences() {
    localStorage.setItem(
        preferenceKey('rankings.preferences'),
        `${state.rankingCategory}|${state.rankingView}`,
    );
}

function saveHistoryPreferences() {
    const filter = state.historyFilter;
    localStorage.setItem(
        preferenceKey('history.filter'),
        [filter.mode, filter.month, filter.year, filter.from, filter.to].join('|'),
    );
}

async function rpc(name, params) {
    const { data, error } = await withTimeout(
        state.client.rpc(name, params),
        SUPABASE_REQUEST_TIMEOUT_MS,
        'SUPABASE_RPC_TIMEOUT',
    );
    if (error) throw error;
    return data;
}

function normalizeAccess(data) {
    const access = Array.isArray(data) ? data[0] : data;
    return access?.is_member && access?.role ? {
        role: access.role,
        email: state.session?.user?.email || '',
    } : null;
}

function normalizeMatches(matches) {
    return (matches || []).map((match) => ({
        id: match.id,
        playedOn: match.played_on,
        seasonId: Number(match.season_id),
        teamAScore: Number(match.team_a_score),
        teamBScore: Number(match.team_b_score),
        teamAPenaltyScore: match.team_a_penalty_score == null ? null : Number(match.team_a_penalty_score),
        teamBPenaltyScore: match.team_b_penalty_score == null ? null : Number(match.team_b_penalty_score),
        participants: match.participants || [],
        goals: match.goals || [],
    })).sort((a, b) => b.playedOn.localeCompare(a.playedOn));
}

function normalizeSnapshot(players, matches) {
    return {
        players: (players || []).map((player) => ({
            id: player.id,
            name: player.name,
            isActive: player.is_active ?? true,
        })),
        matches: normalizeMatches(matches),
    };
}

async function loadApplicationData(force = false) {
    if (!state.access) return;
    const requestedSeasonId = state.selectedSeasonId;
    state.loading = true;
    state.loadError = '';
    if (force) render();
    try {
        const [
            players,
            seasons,
            matches,
            currentPlayerRows,
            avatarRows,
            mvpVotes,
            mvpVotingDisabledMatches,
        ] = await Promise.all([
            rpc('get_public_league_players'),
            rpc('get_league_seasons'),
            rpc('get_public_friendly_matches', { p_season_id: requestedSeasonId }),
            rpc('get_current_league_player_id').catch(() => []),
            rpc('get_league_player_avatars').catch(() => []),
            rpc('get_league_match_mvp_votes').catch(() => []),
            rpc('get_mvp_voting_disabled_matches').catch(() => []),
        ]);
        state.seasons = normalizeSeasons(seasons);
        state.selectedSeasonId = resolveSeasonId(state.seasons, requestedSeasonId);
        state.snapshot = normalizeSnapshot(players, matches);
        state.currentPlayerId = (Array.isArray(currentPlayerRows) ? currentPlayerRows[0] : currentPlayerRows)?.player_id ?? null;
        state.mvpVotes = mvpVotes || [];
        state.mvpVotingDisabledMatchIds = collectDisabledMvpMatchIds(mvpVotingDisabledMatches);
        avatarRefreshGeneration += 1;
        avatarRefreshPromise = null;
        state.avatarRows = Array.isArray(avatarRows) ? avatarRows : [];
        await refreshAvatarUrls({ force: true, replace: true });
        state.profileDetails = {};
        state.loading = false;
        state.adminPlayers = null;
        state.adminMatches = null;
    } catch (error) {
        state.loading = false;
        state.loadError = errorMessage(error, 'No se han podido cargar los datos de la liga. Inténtalo de nuevo.');
    }
    render();
}

async function selectSeason(seasonId) {
    if (state.seasonBusy || seasonId === state.selectedSeasonId) return;
    const season = state.seasons.find((item) => item.id === seasonId);
    if (!season) return;

    const previousSeasonId = state.selectedSeasonId;
    state.selectedSeasonId = seasonId;
    state.seasonBusy = true;
    render();

    try {
        const matches = await rpc('get_public_friendly_matches', { p_season_id: seasonId });
        state.snapshot.matches = normalizeMatches(matches);
        state.profileDetails = {};
    } catch (error) {
        state.selectedSeasonId = previousSeasonId;
        showSnackbar(errorMessage(error, 'No se ha podido cargar la temporada.'), true);
    } finally {
        state.seasonBusy = false;
        render();
    }
}

async function refreshMvpVotes() {
    state.mvpVotes = await rpc('get_league_match_mvp_votes');
}

function clearAvatarRefreshTimer() {
    window.clearTimeout(avatarRefreshTimer);
    avatarRefreshTimer = null;
}

function scheduleAvatarRefresh(delay = AVATAR_REFRESH_INTERVAL_MS) {
    clearAvatarRefreshTimer();

    if (!state.session || !state.access || !state.avatarRows.length) return;

    avatarRefreshTimer = window.setTimeout(() => {
        void refreshAvatarUrls({ force: true, renderAfter: true });
    }, delay);
}

function resetAvatarState() {
    clearAvatarRefreshTimer();
    avatarRefreshGeneration += 1;
    avatarRefreshPromise = null;
    state.avatars = {};
    state.avatarRows = [];
    state.avatarUrlsSignedAt = 0;
    avatarRefreshAttempt = 0;
    lastAvatarFailureRefreshAt = 0;
}

async function refreshAvatarUrls({
    force = false,
    renderAfter = false,
    replace = false,
} = {}) {
    if (!state.client || !state.session || !state.access) return;
    if (!force && !shouldRefreshAvatarUrls(state.avatarUrlsSignedAt)) return;
    if (avatarRefreshPromise) return avatarRefreshPromise;

    if (!state.avatarRows.length) {
        resetAvatarState();
        return;
    }

    const generation = avatarRefreshGeneration;
    const rows = state.avatarRows;
    const refreshPromise = (async () => {
        try {
            const paths = rows.map((row) => row.avatar_path);
            const { data, error } = await withTimeout(
                state.client.storage.from('avatars').createSignedUrls(
                    paths,
                    AVATAR_SIGNED_URL_TTL_SECONDS,
                ),
                SUPABASE_REQUEST_TIMEOUT_MS,
                'AVATAR_SIGNING_TIMEOUT',
            );

            if (error) throw error;
            if (generation !== avatarRefreshGeneration) return;

            const { urls, missingPlayerIds } = mapSignedAvatarUrls(rows, data);
            state.avatars = replace ? urls : { ...state.avatars, ...urls };

            if (missingPlayerIds.length) {
                const retryDelay = avatarRetryDelay(avatarRefreshAttempt);
                avatarRefreshAttempt += 1;
                scheduleAvatarRefresh(retryDelay);
            } else {
                state.avatarUrlsSignedAt = Date.now();
                avatarRefreshAttempt = 0;
                scheduleAvatarRefresh();
            }

            if (renderAfter) render();
        } catch {
            if (generation !== avatarRefreshGeneration) return;

            const retryDelay = avatarRetryDelay(avatarRefreshAttempt);
            avatarRefreshAttempt += 1;
            scheduleAvatarRefresh(retryDelay);
        }
    })();
    avatarRefreshPromise = refreshPromise;

    try {
        await refreshPromise;
    } finally {
        if (avatarRefreshPromise === refreshPromise) {
            avatarRefreshPromise = null;
        }
    }
}

function playerById(id) {
    return state.snapshot.players.find((player) => player.id === id);
}

function playerName(id) {
    return playerById(id)?.name || 'Jugador';
}

function teamParticipants(match, team) {
    return match.participants.filter((participant) => participant.team === team);
}

function teamLabel(match, team) {
    const members = teamParticipants(match, team).map((participant) => playerName(participant.player_id));
    return members.length ? `Equipo ${team}` : `Equipo ${team}`;
}

function calculateStats() {
    const mvpVoteCounts = countMvpVotes(state.mvpVotes);

    return calculatePlayerStats(state.snapshot).map((item) => ({
        ...item,
        mvpVotes: mvpVoteCounts[item.player.id] || 0,
    }));
}

const RANKINGS = {
    'top-scorer': {
        label: 'Máximo goleador',
        description: 'Ordena a los jugadores por el total de goles marcados en la temporada, de mayor a menor. En caso de empate, queda por delante quien tenga más victorias.',
        sort: (a, b) => b.goals - a.goals || b.wins - a.wins,
        columns: [
            ['PJ', (item) => item.matchesPlayed],
            ['G/P', (item) => formatDecimal(item.goalsPerMatch)],
            ['G', (item) => item.goals, true],
        ],
    },
    'goals-per-match': {
        label: 'Goles / partido',
        description: 'Divide los goles marcados entre los partidos jugados. Solo aparecen jugadores que hayan disputado al menos el 50 % de los partidos de la temporada. En caso de empate, queda por delante quien haya marcado más goles.',
        filter: (item) => isGoalsPerMatchEligible(
            item.matchesPlayed,
            state.snapshot.matches.length,
        ),
        sort: (a, b) => b.goalsPerMatch - a.goalsPerMatch || b.goals - a.goals,
        columns: [
            ['PJ', (item) => item.matchesPlayed],
            ['G', (item) => item.goals],
            ['G/P', (item) => formatDecimal(item.goalsPerMatch), true],
        ],
    },
    zamora: {
        label: 'Zamora',
        description: 'Ordena a los porteros por el menor total de goles encajados. Si un equipo tuvo varios porteros en un partido, los goles encajados se reparten por igual entre ellos. En caso de empate, se priorizan más partidos como portero y después más victorias.',
        filter: (item) => item.goalkeeperMatches > 0,
        sort: (a, b) => a.goalsAgainst - b.goalsAgainst
            || b.goalkeeperMatches - a.goalkeeperMatches
            || b.wins - a.wins,
        columns: [
            ['PP', (item) => item.goalkeeperMatches],
            ['GC/P', (item) => formatDecimal(item.goalsAgainstPerMatch)],
            ['GC', (item) => formatDecimal(item.goalsAgainst), true],
        ],
    },
    'goals-conceded-per-match': {
        label: 'GC / partido',
        description: 'Divide los goles encajados entre los partidos jugados como portero y ordena el resultado de menor a mayor. Si hubo varios porteros en un equipo, los goles del partido se reparten por igual. En caso de empate, se priorizan más partidos como portero y después más victorias.',
        filter: (item) => item.goalkeeperMatches > 0,
        sort: (a, b) => a.goalsAgainstPerMatch - b.goalsAgainstPerMatch
            || b.goalkeeperMatches - a.goalkeeperMatches
            || b.wins - a.wins,
        columns: [
            ['PP', (item) => item.goalkeeperMatches],
            ['GC', (item) => formatDecimal(item.goalsAgainst)],
            ['GC/P', (item) => formatDecimal(item.goalsAgainstPerMatch), true],
        ],
    },
    'most-played': {
        label: 'Más jugado',
        description: 'Ordena a los jugadores por el total de partidos disputados, de mayor a menor. En caso de empate, queda por delante quien tenga más victorias.',
        sort: (a, b) => b.matchesPlayed - a.matchesPlayed || b.wins - a.wins,
        columns: [
            ['V', (item) => item.wins],
            ['E', (item) => item.draws],
            ['D', (item) => item.losses],
            ['PJ', (item) => item.matchesPlayed, true],
        ],
    },
    'most-wins': {
        label: 'Más victorias',
        description: 'Ordena a los jugadores por el total de victorias, de mayor a menor. En caso de empate, queda por delante quien haya marcado más goles.',
        sort: (a, b) => b.wins - a.wins || b.goals - a.goals,
        columns: [
            ['PJ', (item) => item.matchesPlayed],
            ['E', (item) => item.draws],
            ['D', (item) => item.losses],
            ['V', (item) => item.wins, true],
        ],
    },
    'player-on-form': {
        label: 'Jugador en racha',
        scopeLabel: 'FORMA · ÚLTIMOS 5 PARTIDOS',
        description: 'Todos parten de 1.000 Elo. La variación depende del resultado y de la fuerza media del rival: una victoria suma, una derrota resta y un empate puede subir o bajar según lo esperado. En penaltis se usan valores parciales de 0,75 y 0,25. Cada gol suma 2 puntos Elo y cada autogol resta 3. Los últimos cinco partidos pesan 1, 0,8, 0,6, 0,4 y 0,2, del más reciente al más antiguo. No se utiliza ninguna estadística de portería y se necesitan al menos dos apariciones cuando hay dos o más partidos disponibles.',
        filter: (item) => item.isFormEligible,
        sort: (a, b) => b.formScore - a.formScore
            || b.latestFormImpact - a.latestFormImpact
            || b.formGoals - a.formGoals
            || b.formWins - a.formWins
            || b.eloRating - a.eloRating
            || a.player.name.localeCompare(b.player.name, 'es'),
        columns: [
            ['PJ', (item) => item.formMatches],
            ['G', (item) => item.formGoals],
            ['V‑E‑D', (item) => `${item.formWins}-${item.formDraws}-${item.formLosses}`],
            ['PUNTOS', (item) => formatFlooredTotal(item.formScore), true],
        ],
    },
    'people-favourite': {
        label: 'El preferido del pueblo',
        scopeLabel: 'VOTACIONES MVP · PARTIDOS HABILITADOS',
        description: 'Suma los votos MVP recibidos en los partidos con votación habilitada. Los tres primeros partidos quedan fuera; a partir del siguiente, cada participante dispone de un voto por partido.',
        filter: (item) => item.mvpVotes > 0,
        sort: (a, b) => b.mvpVotes - a.mvpVotes
            || b.matchesPlayed - a.matchesPlayed
            || a.player.name.localeCompare(b.player.name, 'es'),
        columns: [
            ['PJ', (item) => item.matchesPlayed],
            ['MVP', (item) => item.mvpVotes, true],
        ],
    },
};

function ranking(category = state.rankingCategory) {
    const definition = RANKINGS[category] || RANKINGS['top-scorer'];
    return calculateStats()
        .filter((item) => item.player.name.trim().toLowerCase() !== 'chango')
        .filter(definition.filter || (() => true))
        .sort(definition.sort);
}

function avatar(player, large = false) {
    const url = state.avatars[player?.id];
    const fallback = initials(player?.name);
    return `<span class="avatar${large ? ' avatar--large' : ''}">${url
        ? `<img src="${esc(url)}" alt="Foto de perfil de ${esc(player.name)}" data-user-avatar data-avatar-player-id="${esc(player.id)}" data-avatar-fallback="${esc(fallback)}">`
        : esc(fallback)}</span>`;
}

function navLink(route, tab, label, iconName, modifier = '') {
    const active = routeTab() === tab;
    return `<a class="nav-link ${modifier}" href="${route}" ${active ? 'aria-current="page"' : ''}>
        <span class="nav-indicator"><span class="nav-icon">${icon(iconName)}</span></span><span class="nav-label">${esc(label)}</span>
    </a>`;
}

function shell(content, options = {}) {
    const route = currentRoute();
    const isNested = route.split('/').filter(Boolean).length > 1 && !['/partidos', '/rankings', '/perfil', '/mister'].includes(route);
    const title = options.topTitle || topbarTitle(route);
    const primary = [
        ['/inicio', 'home', 'Inicio', 'home'],
        ['/partidos', 'matches', 'Partidos', 'matches'],
        ['/rankings', 'rankings', 'Rankings', 'rankings'],
        ['/perfil', 'profile', 'Perfil', 'profile'],
    ];
    if (isAdmin()) primary.push(['/mister', 'manager', 'Míster', 'manager']);

    const navigation = primary.map(([path, tab, label, iconName]) => navLink(path, tab, label, iconName)).join('');
    return `<div class="app-shell${options.routeMotion ? ' app-shell--route-enter' : ''}">
        <header class="topbar">
            <div class="topbar__inner">
                <div class="topbar__compact-leading">
                    ${isNested ? `<button class="topbar__back" type="button" data-action="back">Volver</button>` : `<img class="topbar__compact-logo" src="/hattitriki-app-icon.png" alt="Escudo de Hattitriki">`}
                    <span class="topbar__title">${esc(title)}</span>
                </div>
                <a class="topbar__brand" href="/inicio">
                    <img src="/hattitriki-app-icon.png" alt="Escudo de Hattitriki">
                    <span class="topbar__brand-copy">
                        <strong>HATTITRIKI FC</strong>
                        <small>LIGA GENUINE</small>
                    </span>
                </a>
                ${isNested ? `<span class="topbar__divider" aria-hidden="true"></span><button class="topbar__back topbar__back--desktop" type="button" data-action="back">Volver</button><span class="topbar__nested-title">${esc(title)}</span>` : ''}
                <nav class="topbar__desktop-nav" aria-label="Navegación principal">${navigation}</nav>
                <span class="topbar__spacer"></span>
                <div class="account-menu">
                    <button class="topbar__menu" type="button" data-action="toggle-account" aria-expanded="${state.menuOpen && !state.menuClosing}">Menú</button>
                    ${(state.menuOpen || state.menuClosing) ? `<div class="account-popover${state.menuClosing ? ' account-popover--closing' : ''}">
                        <button class="menu-action" type="button" data-action="logout">Cerrar sesión</button>
                    </div>` : ''}
                </div>
            </div>
        </header>
        <div class="shell-body">
            <nav class="nav-rail" aria-label="Navegación principal">${navigation}</nav>
            <main id="main-content" class="main-scroll" tabindex="-1">
                <div class="pull-refresh-indicator" role="status" aria-live="polite">
                    <span class="pull-refresh-indicator__icon" aria-hidden="true">${icon('refresh')}</span>
                    <span class="pull-refresh-indicator__label">Desliza para actualizar</span>
                </div>
                <div class="pull-refresh-content${options.routeMotion ? ' pull-refresh-content--route-enter' : ''}">${content}</div>
            </main>
        </div>
        <nav class="bottom-nav" aria-label="Navegación principal">${primary.map(([path, tab, label, iconName]) => navLink(path, tab, label, iconName)).join('')}</nav>
        ${state.snackbar ? `<div class="snackbar${state.snackbar.error ? ' snackbar--error' : ''}${state.snackbar.closing ? ' snackbar--closing' : ''}" role="status">${esc(state.snackbar.message)}</div>` : ''}
        ${state.dialog ? renderDialog() : ''}
    </div>`;
}

function topbarTitle(route) {
    if (route === '/inicio') return 'Hattitriki FC';
    if (route === '/partidos') return 'Marcador histórico';
    if (route === '/rankings') return 'Rankings';
    if (route === '/perfil') return 'Perfil';
    if (route === '/mister') return 'Zona míster';
    if (route === '/mister/partidos/nuevo') return 'Nuevo partido';
    if (route === '/mister/jugadores/nuevo') return 'Añadir jugador';
    if (route === '/mister/partidos') return 'Gestionar partidos';
    if (route === '/mister/jugadores') return 'Gestionar jugadores';
    if (route === '/mister/invitacion') return 'Invitar a la liga';
    if (route === '/mister/equipos') return 'Generador de equipos';
    if (route === '/mister/equipos/resultado') return 'Resultado';
    if (route.startsWith('/mister/partidos/')) return 'Editar partido';
    if (route.startsWith('/mister/jugadores/')) return 'Editar jugador';
    if (route.startsWith('/partidos/')) return 'Acta del partido';
    if (route.startsWith('/rankings/jugador/')) return 'Perfil de jugador';
    return 'Hattitriki FC';
}

function pageHeader(title, subtitle = '', actions = '') {
    return `<header class="page-header">
        <div class="page-header__copy">
            <span class="page-kicker">HATTITRIKI · LIGA GENUINE</span>
            <h1 class="page-title">${esc(title)}</h1>
            ${subtitle ? `<p class="page-subtitle">${esc(subtitle)}</p>` : ''}
        </div>
        ${actions}
    </header>`;
}

function stateView(type, title, copy, action = '') {
    const symbol = type === 'error' ? '!' : '⚽';
    const visual = type === 'loading'
        ? `<div class="bouncing-ball-loader" aria-hidden="true">
            <span class="bouncing-ball-loader__ball">⚽</span>
            <span class="bouncing-ball-loader__shadow"></span>
        </div>`
        : `<div class="state-icon">${symbol}</div>`;

    return `<div class="${type}-state">
        <div>${visual}<h2 class="state-title">${esc(title)}</h2>
        <p class="state-copy">${esc(copy)}</p>${action}</div>
    </div>`;
}

function pageLoading(title) {
    return `<section class="page">${pageHeader(title)}<div class="card">${stateView('loading', 'Cargando', 'Estamos preparando los datos de la liga…')}</div></section>`;
}

function renderAuth() {
    lastRenderedRoute = null;
    const animateAuth = authMotionPending && !prefersReducedMotion();
    authMotionPending = false;
    const mode = state.authMode;
    let title = 'HATTITRIKI FC';
    let description = 'Acceso privado para miembros de la liga';
    let fields = '';
    let submit = '';
    let secondary = '';

    if (mode === 'login') {
        fields = `<label class="visually-hidden" for="auth-email">Correo electrónico</label>
            <input id="auth-email" class="input" name="email" type="email" inputmode="email" autocomplete="email" placeholder="Correo electrónico" required>
            <label class="visually-hidden" for="auth-password">Contraseña</label>
            <input id="auth-password" class="input" name="password" type="password" autocomplete="current-password" placeholder="Contraseña" required>`;
        submit = state.authBusy ? 'Entrando…' : 'Entrar';
        secondary = `<button class="btn btn--outline auth-link" type="button" data-action="auth-mode" data-mode="forgot">¿Has olvidado la contraseña?</button>`;
    } else if (mode === 'forgot') {
        title = 'Recupera tu contraseña';
        description = 'Indica el correo con el que accedes a la liga y te enviaremos un enlace seguro.';
        fields = `<label class="visually-hidden" for="auth-email">Correo electrónico</label>
            <input id="auth-email" class="input" name="email" type="email" inputmode="email" autocomplete="email" placeholder="Correo electrónico" required>`;
        submit = state.authBusy ? 'Enviando…' : 'Enviar enlace de recuperación';
        secondary = `<button class="btn btn--outline btn--wide auth-link" type="button" data-action="auth-mode" data-mode="login">Volver al inicio de sesión</button>`;
    } else if (mode === 'sent') {
        title = 'Revisa tu correo';
        description = `Hemos enviado un enlace para crear una nueva contraseña a ${state.recoverySentTo}.`;
        fields = `<div class="auth-message auth-success">Si no lo recibes en unos minutos, revisa la carpeta de spam o solicita otro enlace.</div>`;
        submit = 'Enviar otro enlace';
        secondary = `<button class="btn btn--text auth-link" type="button" data-action="auth-mode" data-mode="login">Volver al inicio de sesión</button>`;
    } else {
        const invitation = mode === 'invite';
        title = invitation ? 'Completa tu invitación' : 'Crea una nueva contraseña';
        description = invitation
            ? 'Elige la contraseña con la que entrarás en Hattitriki.'
            : 'Elige una contraseña nueva para volver a entrar en Hattitriki.';
        fields = `<label class="visually-hidden" for="auth-password">Nueva contraseña</label>
            <div class="password-wrap">
                <input id="auth-password" class="input" name="password" type="password" autocomplete="new-password" placeholder="Nueva contraseña" minlength="8" required>
                <button class="password-toggle" type="button" data-action="toggle-password" aria-label="Mostrar contraseña">◉</button>
            </div>
            <label class="visually-hidden" for="auth-confirm">Repite la contraseña</label>
            <input id="auth-confirm" class="input" name="confirm" type="password" autocomplete="new-password" placeholder="Repite la contraseña" minlength="8" required>`;
        submit = state.authBusy ? 'Guardando…' : invitation ? 'Guardar contraseña' : 'Guardar nueva contraseña';
        secondary = `<button class="btn btn--outline btn--wide auth-link" type="button" data-action="discard-callback">Cancelar</button>`;
    }

    const flow = mode !== 'login';
    root.innerHTML = `<main class="auth-stage${flow ? ' auth-stage--flow' : ''}" aria-label="Acceso a Hattitriki">
        <div class="auth-layout">
            <section class="auth-intro" aria-label="Hattitriki Liga Genuine">
                <div class="auth-intro__brand">
                    <img src="/hattitriki-app-icon.png" alt="">
                    <span><strong>HATTITRIKI FC</strong><small>LIGA GENUINE</small></span>
                </div>
                <div class="auth-intro__copy">
                    <span class="auth-intro__kicker">EL FÚTBOL DE LOS DOMINGOS</span>
                    <h2 class="auth-intro__title"><span>Campeones 3</span><span>Las Estadisticas</span></h2>
                    <p>Resultados, actas, rachas y rankings del grupo en un mismo vestuario digital.</p>
                </div>
                <div class="auth-match-preview" aria-hidden="true">
                    <span class="auth-match-preview__status"><i></i> LIGA PRIVADA</span>
                    <div><span class="team-mark">A</span><strong>HATTITRIKI</strong><b>VS</b><strong>GENUINE</strong><span class="team-mark team-mark--gold">B</span></div>
                    <small>RESULTADOS · ESTADÍSTICAS · ACTAS</small>
                </div>
            </section>
            <section class="auth-card${flow ? ' auth-card--flow' : ''}${animateAuth ? ' auth-card--motion-enter' : ''}">
                <div class="auth-card__heading">
                    <img class="auth-crest" src="/hattitriki-app-icon.png" alt="">
                    <span class="auth-card__kicker">${flow ? 'ACCESO SEGURO' : 'ÁREA DE MIEMBROS'}</span>
                    <h1>${esc(title)}</h1>
                    <p class="auth-description">${esc(description)}</p>
                </div>
                <form id="auth-form" class="auth-form" data-mode="${esc(mode)}" novalidate>
                    ${fields}
                    ${state.authError ? `<div class="auth-message" role="alert">${esc(state.authError)}</div>` : ''}
                    <button class="btn btn--wide" type="submit" ${(state.authBusy || mode === 'login' || mode === 'forgot') ? 'disabled' : ''}>${esc(submit)}</button>
                </form>
                ${secondary}
            </section>
        </div>
    </main>`;
}

function renderAccessCheck() {
    root.innerHTML = `<main class="auth-stage auth-stage--loading" aria-busy="true" aria-label="Comprobando el acceso">
        <section class="auth-card auth-card--loading">
            <img class="auth-crest" src="/hattitriki-app-icon.png" alt="">
            <h1>HATTITRIKI FC</h1>
            <p class="auth-description">Comprobando el acceso a la liga…</p>
            <div class="bouncing-ball-loader" aria-hidden="true">
                <span class="bouncing-ball-loader__ball">⚽</span>
                <span class="bouncing-ball-loader__shadow"></span>
            </div>
        </section>
    </main>`;
}

function renderHome() {
    if (state.loading) return pageLoading('Liga Genuine');
    if (state.loadError) return `<section class="page">${pageHeader('Liga Genuine', 'Resultados, rachas y campeones de la liga Genuine.')}
        <div class="card">${stateView('error', 'No se han podido cargar las estadísticas', state.loadError, `<button class="btn" data-action="refresh">Reintentar</button>`)}</div></section>`;

    const latest = state.snapshot.matches[0];
    const totalGoals = state.snapshot.matches.reduce((total, match) => total + match.teamAScore + match.teamBScore, 0);
    const selectedSeason = state.seasons.find((season) => season.id === state.selectedSeasonId);
    const featuredByKey = {
        'top-scorer': ['⚽', 'Máximo goleador', ranking('top-scorer')[0], (item) => item.goals, 'goles', 'top-scorer'],
        'goals-per-match': ['🎯', 'Goles / partido', ranking('goals-per-match')[0], (item) => formatDecimal(item.goalsPerMatch), 'goles por partido', 'goals-per-match'],
        'most-played': ['👟', 'Más jugado', ranking('most-played')[0], (item) => item.matchesPlayed, 'partidos', 'most-played'],
        'most-wins': ['🏆', 'Más victorias', ranking('most-wins')[0], (item) => item.wins, 'victorias', 'most-wins'],
        'player-on-form': ['🔥', 'Jugador en racha', ranking('player-on-form')[0], (item) => formatFlooredTotal(item.formScore), 'puntos recientes', 'player-on-form'],
    };
    const defaultOrder = Object.keys(featuredByKey);
    const normalizedOrder = [...state.homeOrder.filter((key) => featuredByKey[key]), ...defaultOrder.filter((key) => !state.homeOrder.includes(key))];
    state.homeOrder = normalizedOrder;
    const featured = normalizedOrder.map((key) => featuredByKey[key]).filter(([, , item]) => item);

    return `<section class="page home-page">
        ${pageHeader('Liga Genuine', 'Resultados, rachas y campeones de la liga Genuine.')}
        <section class="league-overview" aria-label="Resumen de la competición">
            <div class="league-overview__identity">
                <img src="/hattitriki-app-icon.png" alt="">
                <span><small>COMPETICIÓN</small><strong>Liga Genuine</strong></span>
            </div>
            <div class="league-overview__stat"><small>PARTIDOS</small><strong>${state.snapshot.matches.length}</strong></div>
            <div class="league-overview__stat"><small>GOLES</small><strong>${totalGoals}</strong></div>
            <div class="league-overview__status"><i></i><span>${esc(selectedSeason?.name || 'Temporada actual')}</span></div>
        </section>
        <section>
            ${latest ? `<a class="card card--highlight card--clickable hero-score" href="/partidos/${toHex(latest.id)}">
                <div class="hero-score__meta"><span class="eyebrow"><i class="live-dot"></i> ÚLTIMO RESULTADO</span><span class="hero-score__date">${esc(formatDate(latest.playedOn))} · FINAL</span></div>
                <div class="score-line${latest.teamAPenaltyScore != null ? ' score-line--with-shootout' : ''}">
                    <span class="team-name"><i class="team-mark">A</i><b>Equipo A</b></span>
                    <span class="hero-score__result">
                        <strong class="score-pill">${latest.teamAScore} <small>—</small> ${latest.teamBScore}</strong>
                        ${latest.teamAPenaltyScore != null ? `<strong class="hero-score__shootout penalty-score" aria-label="Penaltis: ${latest.teamAPenaltyScore} a ${latest.teamBPenaltyScore}">${formatPenaltyScore(latest.teamAPenaltyScore, latest.teamBPenaltyScore)}</strong>` : ''}
                    </span>
                    <span class="team-name"><b>Equipo B</b><i class="team-mark team-mark--gold">B</i></span>
                </div>
                <span class="hero-score__cta">Ver acta completa <b>→</b></span>
            </a>` : `<div class="card">${stateView('empty', 'Aún no hay resultados', 'Cuando se guarde el primer partido aparecerá aquí.')}</div>`}
        </section>
        <section class="home-season">
            <div class="home-season__heading"><p class="eyebrow">${esc(selectedSeason?.name || 'TEMPORADA')}</p><h2 class="section-heading">Estadísticas de la liga</h2>
                <p class="muted">${state.snapshot.matches.length} partidos · ${totalGoals} goles</p></div>
            <p class="home-drag-help" id="home-drag-help">Mantén pulsada una tarjeta y arrástrala para cambiar su posición.</p>
            <div class="stats-grid">
                ${featured.map(([symbol, label, item, value, detail, category]) => `<button class="card card--clickable stat-card" type="button" draggable="false" data-action="open-ranking" data-category="${category}" data-stat-key="${category}" aria-describedby="home-drag-help">
                    ${state.avatars[item.player.id] ? `<img class="stat-card__avatar" src="${esc(state.avatars[item.player.id])}" alt="" draggable="false" data-user-avatar data-avatar-player-id="${esc(item.player.id)}" data-avatar-fallback="${esc(initials(item.player.name))}">` : ''}
                    <span class="stat-card__accent" aria-hidden="true"></span>
                    <span class="stat-card__content">
                        <span class="stat-card__header"><span class="stat-card__label">${esc(label)}</span><span class="stat-card__icon">${symbol}</span></span>
                        <span class="stat-card__value">${esc(item.player.name)}</span>
                        <span class="stat-card__metric"><strong>${esc(value(item))}</strong><small>${esc(detail)}</small></span>
                    </span>
                </button>`).join('')}
            </div>
            <p class="visually-hidden" id="stat-reorder-status" role="status" aria-live="polite"></p>
        </section>
    </section>`;
}

function renderHistory() {
    if (state.loading) return pageLoading('Resultados');
    const filter = state.historyFilter;
    const selectedSeason = state.seasons.find((season) => season.id === state.selectedSeasonId);
    const matches = state.snapshot.matches.filter((match) => {
        if (filter.mode === 'month' && filter.month && filter.year) return match.playedOn.startsWith(`${filter.year}-${filter.month}`);
        if (filter.mode === 'year' && filter.year) return match.playedOn.startsWith(`${filter.year}-`);
        if (filter.mode === 'range') {
            if (filter.from && match.playedOn < filter.from) return false;
            if (filter.to && match.playedOn > filter.to) return false;
        }
        return true;
    });
    const years = [...new Set(state.snapshot.matches.map((match) => match.playedOn.slice(0, 4)))].sort().reverse();
    const monthNames = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    const hasActiveFilter = filter.mode !== 'all';
    const filterSummary = filter.mode === 'month' && filter.month && filter.year
        ? `${monthNames[Number(filter.month) - 1]} de ${filter.year}`
        : filter.mode === 'year' && filter.year
            ? filter.year
            : filter.mode === 'range' && (filter.from || filter.to)
                ? `${filter.from ? formatDate(filter.from, false) : 'Inicio'} – ${filter.to ? formatDate(filter.to, false) : 'Hoy'}`
                : 'Todos los partidos';
    const availableYears = years.length ? years : [String(new Date().getFullYear())];
    return `<section class="page history-page">
        ${pageHeader('Resultados', `Partidos de ${selectedSeason?.name || 'la temporada actual'}.`)}
        <section class="history-sticky">
            <button class="btn btn--outline history-controls-toggle${hasActiveFilter ? ' history-controls-toggle--active' : ''}" type="button" data-action="history-toggle-controls" aria-expanded="${state.historyControlsVisible}" aria-controls="history-controls">
                ${icon('matches')}
                <span>${state.historyControlsVisible ? 'Ocultar filtros' : 'Mostrar filtros'}</span>
                ${hasActiveFilter ? '<small>Filtro activo</small>' : ''}
            </button>
            ${state.historyControlsVisible ? `<section class="card history-filter-shell${hasActiveFilter ? ' history-filter-shell--active' : ''}" id="history-controls" aria-label="Filtros de resultados">
                <label class="history-season-filter">
                    <span class="history-filter-icon history-filter-icon--season" aria-hidden="true">${String(selectedSeason?.number || 1).padStart(2, '0')}</span>
                    <span class="history-filter-copy">
                        <small>TEMPORADA</small>
                        <strong>${esc(selectedSeason?.name || 'Temporada actual')}</strong>
                        <em>${selectedSeason?.isCurrent ? 'Competición en curso' : 'Archivo de la competición'}</em>
                    </span>
                    <select class="select history-season-filter__select" id="history-season-filter" ${state.seasonBusy ? 'disabled' : ''} aria-label="Filtrar partidos por temporada">
                        ${state.seasons.length
        ? state.seasons.map((season) => `<option value="${season.id}" ${season.id === state.selectedSeasonId ? 'selected' : ''}>${esc(season.name)}${season.isCurrent ? ' · Actual' : ''}</option>`).join('')
        : '<option value="" selected>Temporada actual</option>'}
                    </select>
                </label>
                <form id="history-filter" class="filter-panel">
                <div class="filter-panel__header">
                    <span class="history-filter-icon" aria-hidden="true">${icon('matches')}</span>
                    <div class="filter-panel__summary">
                        <span class="filter-panel__eyebrow">FECHA</span>
                        <strong>${esc(filterSummary)}</strong>
                        <small>${hasActiveFilter ? `${matches.length} de ${state.snapshot.matches.length} partidos` : `${state.snapshot.matches.length} partidos guardados`}</small>
                    </div>
                    <button class="btn btn--outline filter-panel__toggle" type="button" data-action="history-toggle-filters" aria-expanded="${state.historyFiltersVisible}">${state.historyFiltersVisible ? 'Cerrar' : hasActiveFilter ? 'Cambiar fechas' : 'Ajustar fechas'}</button>
                </div>
                ${state.historyFiltersVisible ? `<div class="filter-panel__body">
                    <div class="history-mode-grid">
                        <button class="chip" type="button" data-action="history-mode" data-mode="month" aria-pressed="${filter.mode === 'month'}">Mes</button>
                        <button class="chip" type="button" data-action="history-mode" data-mode="year" aria-pressed="${filter.mode === 'year'}">Año</button>
                        <button class="chip history-mode-grid__custom" type="button" data-action="history-mode" data-mode="range" aria-pressed="${filter.mode === 'range'}">Personalizado</button>
                    </div>
                    ${filter.mode === 'month' ? `<div class="history-month-fields">
                        <label class="field"><span>Mes</span><select class="select" name="month">
                            ${monthNames.map((month, index) => `<option value="${String(index + 1).padStart(2, '0')}" ${filter.month === String(index + 1).padStart(2, '0') ? 'selected' : ''}>${month}</option>`).join('')}
                        </select></label>
                        <label class="field"><span>Año</span><select class="select" name="year">${availableYears.map((year) => `<option ${filter.year === String(year) ? 'selected' : ''}>${year}</option>`).join('')}</select></label>
                    </div>` : ''}
                    ${filter.mode === 'year' ? `<label class="field"><span>Año</span><select class="select" name="year">${availableYears.map((year) => `<option ${filter.year === String(year) ? 'selected' : ''}>${year}</option>`).join('')}</select></label>` : ''}
                    ${filter.mode === 'range' ? `<div class="history-range-fields">
                        <label class="field"><span>Desde</span><input class="input" name="from" type="date" value="${esc(filter.from)}"></label>
                        <label class="field"><span>Hasta</span><input class="input" name="to" type="date" value="${esc(filter.to)}"></label>
                    </div>` : ''}
                    ${filter.mode === 'all' ? '<p class="filter-panel__all">Se mostrarán todos los partidos guardados.</p>' : ''}
                    <div class="filter-panel__actions">
                        ${hasActiveFilter ? '<button class="btn btn--text" type="button" data-action="history-clear">Limpiar filtro</button>' : '<span></span>'}
                        <button class="btn filter-panel__done" type="submit">Hecho</button>
                    </div>
                </div>` : ''}
                </form>
            </section>` : ''}
            <p class="history-count">PARTIDOS FINALIZADOS · ${matches.length}</p>
        </section>
        <section>
            ${matches.length ? `<div class="match-list">${matches.map(renderMatchRow).join('')}</div>` :
                `<div class="card">${stateView('empty', filter.mode === 'all' ? 'Todavía no hay partidos guardados.' : 'No hay partidos para el filtro seleccionado.', filter.mode === 'all' ? 'Los resultados aparecerán aquí cuando se guarde la primera acta.' : 'Cambia el periodo seleccionado o vuelve a mostrar todos los partidos.')}</div>`}
        </section>
    </section>`;
}

function renderMatchRow(match) {
    return `<a class="card card--clickable match-row" href="/partidos/${toHex(match.id)}" aria-label="Abrir partido del ${esc(formatDate(match.playedOn))}, ${match.teamAScore} a ${match.teamBScore}">
        <span class="match-row__meta"><span class="match-row__date">${esc(formatDate(match.playedOn))}</span><span class="match-row__final">FINAL</span></span>
        <span class="match-row__score"><span class="match-row__team"><i class="team-mark">A</i>Equipo A</span><strong class="score-pill">${match.teamAScore} - ${match.teamBScore}</strong><span class="match-row__team">Equipo B<i class="team-mark team-mark--gold">B</i></span></span>
        <span class="match-row__penalties">${match.teamAPenaltyScore != null ? `<span class="penalty-score">${formatPenaltyScore(match.teamAPenaltyScore, match.teamBPenaltyScore)}</span>` : '&nbsp;'}</span>
    </a>`;
}

function renderRankings() {
    if (state.loading) return pageLoading('Rankings');
    const animateResults = rankingMotionPending && !prefersReducedMotion();
    rankingMotionPending = false;
    const motionClass = animateResults ? ' ranking-content--motion-enter' : '';
    const definition = RANKINGS[state.rankingCategory] || RANKINGS['top-scorer'];
    const entries = ranking(state.rankingCategory);
    const showRecentForm = state.rankingView === 'detailed';
    const rankingRowClasses = `ranking-row--metrics-${definition.columns.length}${showRecentForm ? ' ranking-row--detailed' : ''}`;
    const filters = `<div class="ranking-category-grid">${RANKING_CATEGORY_KEYS.map((key) => {
        const item = RANKINGS[key];
        return `<button class="chip" type="button" data-action="ranking-category" data-category="${key}" aria-pressed="${state.rankingCategory === key}">${esc(item.label)}</button>`;
    }).join('')}</div>`;
    return `<section class="page rankings-page">
        ${pageHeader('Rankings')}
        <section class="card card--highlight ranking-summary${motionClass}">
            <span class="ranking-summary__icon">${RANKING_SYMBOLS[state.rankingCategory] || '⚽'}</span>
            <span class="ranking-summary__copy"><strong>${esc(definition.label)}</strong><small>${esc(definition.scopeLabel || 'CLASIFICACIÓN DE LA TEMPORADA')} · ${entries.length} JUGADORES</small></span>
            <button class="ranking-summary__info" type="button" data-action="ranking-info" aria-label="Información sobre ${esc(definition.label)}">i</button>
        </section>
        <button class="btn btn--outline rankings-filters-toggle" type="button" data-action="toggle-ranking-filters">${state.rankingFiltersVisible ? 'Ocultar filtros' : 'Mostrar filtros'}</button>
        <div class="rankings-filters${state.rankingFiltersVisible ? ' rankings-filters--visible' : ''}">${filters}</div>
        <div class="ranking-view-selector">
            <button class="chip" type="button" data-action="ranking-view" data-view="compact" aria-pressed="${state.rankingView === 'compact'}">Compacta</button>
            <button class="chip" type="button" data-action="ranking-view" data-view="detailed" aria-pressed="${state.rankingView === 'detailed'}">Detallada</button>
        </div>
        ${entries.length ? `<div class="ranking-table${motionClass}">
            <div class="ranking-row ranking-row--head ${rankingRowClasses}"><span>#</span><span></span><span>JUGADOR</span>${definition.columns.map(([label]) => `<span class="ranking-metric">${esc(label)}</span>`).join('')}${showRecentForm ? '<span class="recent-form recent-form--head">RACHA</span>' : ''}</div>
            ${entries.map((entry, index) => renderRankingRow(entry, index, definition, rankingRowClasses)).join('')}
        </div>` : `<div class="card${motionClass}">${stateView('empty', 'No hay jugadores para esta clasificación', 'Los datos aparecerán cuando existan partidos suficientes.')}</div>`}
    </section>`;
}

function renderRankingRow(entry, index, definition, rankingRowClasses) {
    const rankNumber = index + 1;
    return `<a class="ranking-row ${rankingRowClasses}${rankNumber <= 3 ? ' ranking-row--podium' : ''}" href="/rankings/jugador/${toHex(entry.player.id)}">
        <span class="rank">${rankNumber}</span>${avatar(entry.player)}<span class="ranking-name">${esc(entry.player.name)}</span>
        ${definition.columns.map(([, value, primary]) => `<span class="ranking-metric${primary ? ' ranking-metric--primary' : ''}">${esc(value(entry))}</span>`).join('')}
        ${state.rankingView === 'detailed' ? `<span class="recent-form"><span class="recent-form__label">RACHA</span>${entry.recentForm.map((result) => `<span class="form-dot form-dot--${result}" title="${result === 'win' ? 'Victoria' : result === 'draw' ? 'Empate' : result === 'loss' ? 'Derrota' : result === 'none' ? 'No jugó' : 'Partido pendiente'}">${result === 'win' ? 'V' : result === 'draw' ? 'E' : result === 'loss' ? 'D' : ''}</span>`).join('')}</span>` : ''}
    </a>`;
}

function profileSummary(playerId) {
    const stats = calculateStats().find((item) => item.player.id === playerId);
    if (!stats) return null;
    const teammateCounts = {};
    const rivalCounts = {};
    for (const match of state.snapshot.matches) {
        const ownTeams = new Set(match.participants.filter((p) => p.player_id === playerId).map((p) => p.team));
        if (!ownTeams.size) continue;
        const others = new Map();
        for (const participant of match.participants.filter((p) => p.player_id !== playerId)) {
            if (!others.has(participant.player_id)) others.set(participant.player_id, new Set());
            others.get(participant.player_id).add(participant.team);
        }
        for (const [id, teams] of others) {
            if ([...ownTeams].some((team) => teams.has(team))) teammateCounts[id] = (teammateCounts[id] || 0) + 1;
            if ([...ownTeams].some((team) => [...teams].some((other) => other !== team))) rivalCounts[id] = (rivalCounts[id] || 0) + 1;
        }
    }
    const best = (counts) => {
        const entries = Object.entries(counts);
        const maximum = entries.reduce((value, [, count]) => Math.max(value, count), 0);
        if (!maximum) return null;
        const leaders = entries
            .filter(([, count]) => count === maximum)
            .sort((a, b) => playerName(a[0]).toLocaleLowerCase('es')
                .localeCompare(playerName(b[0]).toLocaleLowerCase('es'), 'es')
                || a[0].localeCompare(b[0]));
        return [leaders[0][0], maximum, leaders.length > 1];
    };
    return { stats, teammate: best(teammateCounts), rival: best(rivalCounts) };
}

async function loadPlayerProfileDetail(playerId) {
    if (!playerId || state.profileDetails[playerId]) return;
    state.profileDetails[playerId] = 'loading';
    render();
    try {
        const rows = await rpc('get_league_player_profile', { p_player_id: playerId });
        const detail = Array.isArray(rows) ? rows[0] : rows;
        state.profileDetails[playerId] = detail || { error: 'No se ha encontrado este perfil.' };
    } catch (error) {
        state.profileDetails[playerId] = {
            error: errorMessage(error, 'No se ha podido cargar el perfil del jugador.'),
        };
    }
    render();
}

function renderPlayerProfile(playerId, ownProfile = false) {
    if (state.loading) return pageLoading(ownProfile ? 'Perfil' : 'Perfil de jugador');
    if (!state.profileDetails[playerId]) {
        queueMicrotask(() => loadPlayerProfileDetail(playerId));
        return pageLoading(ownProfile ? 'Perfil' : 'Perfil de jugador');
    }
    const summary = profileSummary(playerId);
    if (!summary) return `<section class="page">${pageHeader('Perfil de jugador')}<div class="card">${stateView('error', 'Perfil no disponible', 'No se ha encontrado este jugador.', `<button class="btn" data-action="back">Volver</button>`)}</div></section>`;
    const item = summary.stats;
    const profileDetail = state.profileDetails[playerId];
    const canEditPhoto = profileDetail !== 'loading'
        && !profileDetail.error
        && Boolean(profileDetail.is_current_player);
    const selectedSeason = state.seasons.find((season) => season.id === state.selectedSeasonId);
    const winRate = item.matchesPlayed ? Math.round((item.wins / item.matchesPlayed) * 100) : 0;
    const formScore = Math.floor(Number(item.formScore) || 0);
    const formScoreLabel = `${formScore > 0 ? '+' : ''}${formatFlooredTotal(formScore)}`;
    const rankPosition = (category) => {
        const index = ranking(category).findIndex((entry) => entry.player.id === playerId);
        return index >= 0 ? index + 1 : null;
    };
    const dashboardMetrics = [
        ['Partidos', item.matchesPlayed, item.matchesPlayed, 'integer', 'Partidos en los que el jugador aparece en una alineación.', 'matches', 'most-played'],
        ['Goles', item.goals, item.goals, 'integer', 'Goles marcados por el jugador. Los goles en propia puerta no suman.', 'goals', 'top-scorer'],
        ['Goles / partido', formatDecimal(item.goalsPerMatch), item.goalsPerMatch, 'decimal', 'Media de goles marcados por cada partido jugado.', 'average', 'goals-per-match'],
        ['Victorias', item.wins, item.wins, 'integer', 'Partidos jugados que terminó ganando su equipo.', 'wins', 'most-wins'],
        ['Puntos de forma', formScoreLabel, formScore, 'signed', 'Puntuación ponderada obtenida en los últimos cinco partidos.', 'form', 'player-on-form'],
        ['Votos MVP', item.mvpVotes, item.mvpVotes, 'integer', 'Votos recibidos en partidos con la elección de MVP habilitada.', 'mvp', 'people-favourite'],
    ];
    const dashboardRankings = [
        ['Goleadores', rankPosition('top-scorer'), `${item.goals} ${item.goals === 1 ? 'gol' : 'goles'}`, 'top-scorer'],
        ['Victorias', rankPosition('most-wins'), `${item.wins} ${item.wins === 1 ? 'victoria' : 'victorias'}`, 'most-wins'],
        ['En racha', rankPosition('player-on-form'), item.isFormEligible ? `${formScoreLabel} puntos` : 'Sin mínimo de partidos', 'player-on-form'],
        ['MVP', rankPosition('people-favourite'), `${item.mvpVotes} ${item.mvpVotes === 1 ? 'voto' : 'votos'}`, 'people-favourite'],
    ];
    const formLabels = {
        win: ['V', 'Victoria', 'win'],
        draw: ['E', 'Empate', 'draw'],
        loss: ['D', 'Derrota', 'loss'],
        none: ['—', 'No jugó', 'none'],
        pending: ['·', 'Sin partido', 'pending'],
    };
    const formChart = item.recentForm.map((result, index) => {
        const [shortLabel, longLabel, modifier] = formLabels[result] || formLabels.pending;
        return `<li class="profile-form-chart__item profile-form-chart__item--${modifier}" aria-label="Partido ${index + 1}: ${longLabel}">
            <span class="profile-form-chart__bar"><i></i></span><strong>${shortLabel}</strong>
        </li>`;
    }).join('');
    const metricExplanations = [
        ...dashboardMetrics.map(([label, , , , explanation]) => [label, explanation]),
        ['Porcentaje de victorias', 'Victorias divididas entre los partidos jugados, redondeado al número entero más cercano.'],
        ['Forma reciente', 'Representa, del partido más antiguo al más reciente, victorias, empates, derrotas y jornadas en las que no participó.'],
    ];
    const avatarContent = state.avatars[playerId]
        ? `<button class="profile-avatar-button" type="button" data-action="view-avatar" data-url="${esc(state.avatars[playerId])}" data-player-id="${esc(playerId)}" data-name="${esc(item.player.name)}">${avatar(item.player, true)}</button>`
        : avatar(item.player, true);
    const profileAvatar = `<div class="profile-avatar-wrap">${avatarContent}${canEditPhoto ? `<label class="profile-avatar-edit" for="avatar-upload" aria-label="${state.avatars[playerId] ? 'Cambiar foto' : 'Añadir foto'}">${icon('edit')}<input id="avatar-upload" class="visually-hidden" type="file" accept="image/jpeg,image/webp"></label>` : ''}</div>`;
    return `<section class="page profile-page">
        ${pageHeader('Perfil')}
        <section class="card card--highlight profile-hero" aria-labelledby="profile-player-name">
            <div class="profile-hero__identity">
                ${profileAvatar}
                <div class="profile-hero__copy">
                    <span class="profile-hero__season">${esc(selectedSeason?.name || 'TEMPORADA ACTUAL')}</span>
                    <h2 id="profile-player-name" class="profile-name">${esc(item.player.name)}</h2>
                    <div class="profile-hero__badges">
                        <span class="profile-status${item.player.isActive ? ' profile-status--active' : ''}"><i aria-hidden="true"></i>${item.player.isActive ? 'JUGADOR ACTIVO' : 'JUGADOR INACTIVO'}</span>
                        ${playerId === state.currentPlayerId ? '<span class="profile-current">TU PERFIL</span>' : ''}
                    </div>
                </div>
            </div>
            <div class="profile-hero__numbers" aria-label="Resumen de rendimiento">
                <span><small>GOLES</small><strong data-motion-number="${esc(item.goals)}">${esc(item.goals)}</strong></span>
                <span><small>FORMA</small><strong class="${formScore > 0 ? 'is-positive' : formScore < 0 ? 'is-negative' : ''}" data-motion-number="${esc(formScore)}" data-motion-format="signed">${esc(formScoreLabel)}</strong></span>
                <span><small>VICTORIAS</small><strong data-motion-number="${esc(winRate)}" data-motion-format="percent">${esc(winRate)}%</strong></span>
            </div>
        </section>
        ${profileDetail !== 'loading' && !profileDetail.error && !profileDetail.has_linked_account ? '<div class="card profile-hint">Este jugador todavía no tiene una cuenta vinculada.</div>' : ''}
        ${profileDetail?.error ? `<div class="auth-message" role="alert">${esc(profileDetail.error)}</div>` : ''}
        <div class="profile-dashboard-grid">
            <section class="card profile-overview" aria-labelledby="profile-overview-title">
                <header class="profile-card-heading">
                    <div><span>RENDIMIENTO</span><h2 id="profile-overview-title">Tus números</h2></div>
                    <span class="profile-card-heading__meta">${esc(item.matchesPlayed)} PJ</span>
                </header>
                <div class="profile-overview__metrics">
                    ${dashboardMetrics.map(([label, value, motionValue, motionFormat, , modifier, rankingCategory]) => `<div class="profile-stat profile-stat--${modifier}"><span class="profile-stat__icon" aria-hidden="true">${RANKING_SYMBOLS[rankingCategory] || '⚽'}</span><strong data-motion-number="${esc(motionValue)}" data-motion-format="${esc(motionFormat)}">${esc(value)}</strong><small>${esc(label)}</small></div>`).join('')}
                </div>
            </section>
            <section class="card profile-winrate" aria-labelledby="profile-winrate-title">
                <header class="profile-card-heading profile-card-heading--compact">
                    <div><span>EFECTIVIDAD</span><h2 id="profile-winrate-title">Victorias</h2></div>
                </header>
                <div class="profile-winrate__body">
                    <div class="profile-donut" role="img" aria-label="${winRate}% de victorias">
                        <svg viewBox="0 0 42 42" aria-hidden="true"><circle class="profile-donut__track" cx="21" cy="21" r="15.9155"></circle><circle class="profile-donut__value" cx="21" cy="21" r="15.9155" stroke-dasharray="${winRate} ${100 - winRate}"></circle></svg>
                        <span><strong data-motion-number="${esc(winRate)}" data-motion-format="percent">${winRate}%</strong><small>de partidos</small></span>
                    </div>
                    <div class="profile-winrate__copy"><strong>${item.wins} de ${item.matchesPlayed}</strong><span>${item.matchesPlayed ? (winRate >= 60 ? 'Gran temporada' : winRate >= 40 ? 'Balance competitivo' : 'Margen para crecer') : 'Aún sin partidos'}</span></div>
                </div>
            </section>
            <section class="card profile-form-card" aria-labelledby="profile-form-title">
                <header class="profile-card-heading">
                    <div><span>ÚLTIMOS 5 PARTIDOS</span><h2 id="profile-form-title">Evolución reciente</h2></div>
                    <strong class="profile-form-card__score${formScore > 0 ? ' is-positive' : formScore < 0 ? ' is-negative' : ''}">${esc(formScoreLabel)} pts</strong>
                </header>
                <ol class="profile-form-chart" aria-label="Resultados recientes, del más antiguo al más reciente">${formChart}</ol>
                <div class="profile-chart-legend" aria-hidden="true"><span class="is-win">Victoria</span><span class="is-draw">Empate</span><span class="is-loss">Derrota</span></div>
            </section>
            <section class="card profile-balance" aria-labelledby="profile-balance-title">
                <header class="profile-card-heading">
                    <div><span>RESULTADOS</span><h2 id="profile-balance-title">Balance</h2></div>
                </header>
                <svg class="profile-balance__bar" viewBox="0 0 100 8" preserveAspectRatio="none" role="img" aria-label="${item.wins} victorias, ${item.draws} empates y ${item.losses} derrotas">
                    <rect class="profile-balance__track" x="0" y="0" width="100" height="8"></rect>
                    <rect class="is-win" x="0" y="0" width="${item.matchesPlayed ? (item.wins / item.matchesPlayed) * 100 : 0}" height="8"></rect>
                    <rect class="is-draw" x="${item.matchesPlayed ? (item.wins / item.matchesPlayed) * 100 : 0}" y="0" width="${item.matchesPlayed ? (item.draws / item.matchesPlayed) * 100 : 0}" height="8"></rect>
                    <rect class="is-loss" x="${item.matchesPlayed ? ((item.wins + item.draws) / item.matchesPlayed) * 100 : 0}" y="0" width="${item.matchesPlayed ? (item.losses / item.matchesPlayed) * 100 : 0}" height="8"></rect>
                </svg>
                <dl class="profile-balance__rows">
                    <div><dt><i class="is-win"></i>Victorias</dt><dd>${item.wins}</dd></div>
                    <div><dt><i class="is-draw"></i>Empates</dt><dd>${item.draws}</dd></div>
                    <div><dt><i class="is-loss"></i>Derrotas</dt><dd>${item.losses}</dd></div>
                </dl>
            </section>
            <section class="card profile-rankings-card" aria-labelledby="profile-rankings-title">
                <header class="profile-card-heading">
                    <div><span>COMPARATIVA DE LIGA</span><h2 id="profile-rankings-title">Tus posiciones</h2></div>
                    <a href="/rankings">Ver rankings <span aria-hidden="true">›</span></a>
                </header>
                <div class="profile-ranking-list">
                    ${dashboardRankings.map(([label, position, value, category]) => `<a href="/rankings" data-action="open-ranking" data-category="${category}"><span class="profile-ranking-list__position">${position ? `<strong>${position}</strong><small>º</small>` : '<strong>—</strong>'}</span><span><strong>${esc(label)}</strong><small>${esc(value)}</small></span><i aria-hidden="true">›</i></a>`).join('')}
                </div>
            </section>
            <section class="profile-connections" aria-labelledby="profile-connections-title"><header class="profile-card-heading profile-card-heading--standalone"><div><span>COMPAÑEROS Y RIVALES</span><h2 id="profile-connections-title">Conexiones en la liga</h2></div></header>
                ${renderConnection('Máximo rival', ownProfile ? 'El jugador contra el que más te has enfrentado.' : 'El jugador al que se ha enfrentado más veces.', summary.rival, 'rival')}
                ${renderConnection('Compañero inseparable', ownProfile ? 'El jugador con el que más has compartido equipo.' : 'El jugador con el que más ha compartido equipo.', summary.teammate, 'teammate')}
            </section>
        </div>
        <div class="profile-explanations-wrap">
            <button class="btn btn--outline btn--wide" data-action="toggle-metric-explanations" aria-expanded="${state.profileExplanations}">${state.profileExplanations ? 'Ocultar cómo se calcula' : 'Cómo se calculan estas métricas'}</button>
            ${state.profileExplanations ? `<div class="card profile-explanations">${metricExplanations.map(([label, explanation]) => `<div><strong>${esc(label)}</strong><p>${esc(explanation)}</p></div>`).join('')}</div>` : ''}
        </div>
    </section>`;
}

function renderConnection(title, copy, connection, kind = '') {
    return `<div class="card connection-card connection-card--${kind}"><h3>${esc(title)}</h3><p class="muted connection-card__copy">${esc(copy)}</p>
        ${connection ? `<a class="connection-card__player" href="/rankings/jugador/${toHex(connection[0])}">${avatar(playerById(connection[0]))}<strong class="connection-card__name">${esc(playerName(connection[0]))}</strong><span class="connection-card__matches">${connection[1]} PJ <span aria-hidden="true">›</span></span></a>${connection[2] ? '<p class="muted connection-card__tie">Empata con otro jugador.</p>' : ''}` : '<div class="connection-card__value muted">No hay suficientes partidos</div>'}
    </div>`;
}

function renderOwnProfile() {
    if (state.loading) return pageLoading('Perfil');
    if (!state.currentPlayerId) return `<section class="page">${pageHeader('Perfil', 'Tu ficha y estadísticas de la liga.')}<div class="card">${stateView('empty', 'Cuenta sin jugador vinculado', 'Un administrador debe vincular tu cuenta con un jugador de la liga.')}</div></section>`;
    return renderPlayerProfile(state.currentPlayerId, true);
}

function renderMatchDetail(id) {
    if (state.loading) return pageLoading('Acta del partido');
    const match = state.snapshot.matches.find((item) => item.id === id);
    if (!match) return `<section class="page">${pageHeader('Acta del partido')}<div class="card">${stateView('error', 'Partido no encontrado', 'No se ha podido abrir esta acta.', `<button class="btn" data-action="back">Volver</button>`)}</div></section>`;
    const teamForGoal = (goal) => goal.team || match.participants.find((participant) => participant.player_id === goal.player_id)?.team || 'A';
    const goalEntries = aggregateGoals(match.goals, match.participants);
    const totalRecordedGoals = goalEntries.reduce((total, goal) => total + Number(goal.count), 0);
    const participantCount = new Set(match.participants.map((participant) => participant.player_id)).size;
    const matchMvpPlayerId = resolveMatchMvpPlayerId(state.mvpVotes, match.id);
    return `<section class="page match-detail-page">
        ${pageHeader(formatDate(match.playedOn), 'Acta del partido y alineaciones.')}
        <div class="match-detail-grid">
            <section class="card card--highlight scoreboard match-scoreboard" aria-labelledby="match-scoreboard-title">
                <h2 id="match-scoreboard-title" class="visually-hidden">Resultado final</h2>
                <div class="match-scoreboard__meta">
                    <span class="match-scoreboard__status"><i aria-hidden="true"></i> Finalizado</span>
                    <span>${participantCount} jugadores · ${totalRecordedGoals} goles registrados</span>
                </div>
                <div class="scoreboard__main">
                    <span class="scoreboard__team scoreboard__team--a">
                        <i class="team-mark">A</i>
                        <span class="scoreboard__team-copy"><small>Equipo</small><b>A</b></span>
                    </span>
                    <span class="scoreboard__score">
                        <small class="scoreboard__label">Resultado</small>
                        <strong class="scoreboard__result" aria-label="Equipo A ${match.teamAScore}, Equipo B ${match.teamBScore}"><span>${match.teamAScore}</span><i>:</i><span>${match.teamBScore}</span></strong>
                        ${match.teamAPenaltyScore != null ? `<strong class="scoreboard__shootout penalty-score" aria-label="Penaltis: ${match.teamAPenaltyScore} a ${match.teamBPenaltyScore}">${formatPenaltyScore(match.teamAPenaltyScore, match.teamBPenaltyScore)}</strong>` : ''}
                    </span>
                    <span class="scoreboard__team scoreboard__team--b">
                        <span class="scoreboard__team-copy"><small>Equipo</small><b>B</b></span>
                        <i class="team-mark team-mark--gold">B</i>
                    </span>
                </div>
            </section>
            <section class="match-detail-section match-teams">
                <header class="match-detail-section__header"><div><span>PLANTILLAS</span><h2 class="section-heading">Alineaciones</h2></div><strong>${participantCount} jugadores</strong></header>
                <div class="team-grid">
                ${['A', 'B'].map((team) => {
                    const participants = teamParticipants(match, team);
                    return `<section class="card team-card team-card--${team.toLowerCase()}">
                        <header class="team-card__heading"><i class="team-mark${team === 'B' ? ' team-mark--gold' : ''}">${team}</i><span><small>EQUIPO</small><strong>Equipo ${team}</strong></span><b>${participants.length}</b></header>
                        <div class="team-card__players">${participants.map((participant) => {
                            const player = playerById(participant.player_id);
                            return `<a class="player-line card--clickable" href="/rankings/jugador/${toHex(participant.player_id)}">
                                ${avatar(player)}
                                <span class="player-line__copy">
                                    <span class="player-line__name-row">
                                        <strong class="player-line__name">${esc(playerName(participant.player_id))}</strong>
                                        ${participant.player_id === matchMvpPlayerId ? `<span class="player-line__mvp-badge" title="MVP del partido">${icon('mvp', 'MVP del partido')}</span>` : ''}
                                    </span>
                                    <small>${participant.was_goalkeeper ? 'Portero' : 'Jugador'}</small>
                                </span>
                                ${participant.was_goalkeeper ? '<span class="goalkeeper-glove" title="Portero">🧤</span>' : ''}
                                <span class="player-line__chevron" aria-hidden="true">›</span>
                            </a>`;
                        }).join('') || '<div class="player-line muted">Sin jugadores</div>'}</div>
                    </section>`;
                }).join('')}
            </div></section>
            <section class="match-detail-section match-goals">
                <header class="match-detail-section__header"><div><span>CRONOLOGÍA</span><h2 class="section-heading">Goles</h2></div><strong>${totalRecordedGoals} en total</strong></header>
                <div class="goals-card">
                ${goalEntries.length ? goalEntries.map((goal) => {
                    const team = teamForGoal(goal);
                    const ownGoal = Boolean(goal.is_own_goal);
                    return `<a class="goal-entry goal-entry--${team.toLowerCase()}${ownGoal ? ' goal-entry--own' : ''}" href="/rankings/jugador/${toHex(goal.player_id)}">
                        <span class="goal-entry__top">
                            <span class="goal-entry__icon">${ownGoal ? 'PP' : '⚽'}</span>
                            <span class="goal-entry__copy"><small>EQUIPO ${team}</small><strong>${esc(playerName(goal.player_id))}</strong>${ownGoal ? '<em>En propia puerta</em>' : ''}</span>
                            <strong class="goal-entry__count">×${Number(goal.count)}</strong>
                        </span>
                    </a>`;
                }).join('') : '<p class="goals-card__empty">No se registraron goleadores.</p>'}
            </div></section>
            ${renderMatchMvp(match)}
        </div>
    </section>`;
}

function renderMatchMvp(match) {
    const participantIds = [...new Set(
        match.participants.map((participant) => participant.player_id),
    )];
    const matchVotes = state.mvpVotes.filter((vote) => vote.match_id === match.id);
    const voteCounts = new Map(
        matchVotes.map((vote) => [vote.nominee_player_id, Number(vote.vote_count)]),
    );
    const currentVote = matchVotes.find((vote) => vote.is_current_vote);
    const { votingEnabled, eligible } = resolveMvpVotingAccess(
        match.id,
        state.currentPlayerId,
        participantIds,
        state.mvpVotingDisabledMatchIds,
    );
    const candidateIds = resolveMvpCandidates(participantIds, state.currentPlayerId);
    const panelOpen = state.mvpVotingMatchId === match.id;

    return `<section class="card match-mvp">
        <div class="match-mvp__intro">
            <span class="match-mvp__symbol" aria-hidden="true">★</span>
            <div class="match-mvp__copy">
                <span>VOTACIÓN DEL PARTIDO</span>
                <h2>¿Quién fue el MVP?</h2>
                <p>${!votingEnabled
                    ? 'La votación MVP empieza a partir del próximo partido.'
                    : eligible
                        ? 'Elige a otro jugador como el más destacado. Puedes cambiar tu voto cuando quieras.'
                        : 'Solo los jugadores que participaron en este partido pueden votar.'}</p>
            </div>
            <div class="match-mvp__action">
                ${currentVote ? `<span class="match-mvp__current">Tu voto: <strong>${esc(playerName(currentVote.nominee_player_id))}</strong></span>` : ''}
                <button class="btn match-mvp__button" type="button" data-action="toggle-mvp-vote" data-match-id="${esc(match.id)}" ${eligible && !state.mvpBusy ? '' : 'disabled'}>
                    ${!votingEnabled ? 'Votación no disponible' : currentVote ? 'Cambiar mi voto' : 'Votar al MVP'}
                </button>
            </div>
        </div>
        ${panelOpen && eligible ? `<div class="match-mvp__panel">
            <p>Selecciona a otro jugador de la alineación</p>
            <div class="mvp-candidate-grid">
                ${candidateIds.map((playerId) => {
                    const player = playerById(playerId);
                    const selected = currentVote?.nominee_player_id === playerId;
                    const team = match.participants.find((participant) => participant.player_id === playerId)?.team || '';
                    const votes = voteCounts.get(playerId) || 0;
                    return `<button class="mvp-candidate${selected ? ' mvp-candidate--selected' : ''}" type="button" data-action="cast-mvp-vote" data-match-id="${esc(match.id)}" data-player-id="${esc(playerId)}" aria-pressed="${selected}" ${state.mvpBusy ? 'disabled' : ''}>
                        ${avatar(player)}
                        <span class="mvp-candidate__copy"><strong>${esc(playerName(playerId))}</strong><small>Equipo ${esc(team)}</small></span>
                        <span class="mvp-candidate__votes">${votes} ${votes === 1 ? 'voto' : 'votos'}</span>
                        <span class="mvp-candidate__check" aria-hidden="true">${selected ? '✓' : '›'}</span>
                    </button>`;
                }).join('') || '<p class="muted">No hay otros jugadores disponibles.</p>'}
            </div>
        </div>` : ''}
    </section>`;
}

function renderAdmin() {
    if (!isAdmin()) return restrictedPage();
    const sections = [
        ['Partidos', 'Crea actas y corrige resultados.', [
            ['/mister/partidos/nuevo', 'plus', 'Nuevo partido', 'Crea un acta completa en tres pasos.'],
            ['/mister/partidos', 'edit', 'Editar o borrar partidos', 'Gestiona el histórico de actas.'],
        ]],
        ['Plantilla y accesos', 'Añade jugadores, mantén la plantilla y gestiona el acceso a la liga.', [
            ['/mister/jugadores/nuevo', 'userPlus', 'Añadir jugador', 'Da de alta a un jugador en la liga.'],
            ['/mister/jugadores', 'profile', 'Editar o borrar jugadores', 'Gestiona la plantilla activa e inactiva.'],
            ['/mister/invitacion', 'mail', 'Invitar a la liga', 'Vincula una cuenta con un jugador.'],
        ]],
        ['Herramientas', 'Prepara equipos equilibrados antes del partido.', [
            ['/mister/equipos', 'shuffle', 'Generador de equipos', 'Sortea equipos y controla el cardio.'],
        ]],
    ];
    return `<section class="page admin-page manager-page">
        ${pageHeader('Zona míster', 'Gestiona partidos y jugadores desde un espacio privado.')}
        <section class="manager-overview">
            <span class="manager-overview__symbol" aria-hidden="true">${icon('manager')}</span>
            <div>
                <strong>Centro de operaciones</strong>
                <p>Prepara la jornada, mantén la plantilla y corrige cualquier dato desde aquí.</p>
            </div>
            <span class="manager-overview__status"><i></i> Acceso de míster</span>
        </section>
        <div class="admin-grid">${sections.map(([title, copy, tools], sectionIndex) => `<section class="card admin-section admin-section--${sectionIndex + 1}">
            <header class="admin-section__header">
                <span class="admin-section__number">0${sectionIndex + 1}</span>
                <div><h2>${esc(title)}</h2><p>${esc(copy)}</p></div>
            </header>
            <div class="admin-tools">${tools.map(([route, iconName, label, description]) => `<a class="admin-tool" href="${route}">
                <span class="admin-tool__icon" aria-hidden="true">${icon(iconName)}</span>
                <span class="admin-tool__copy"><strong>${esc(label)}</strong><small>${esc(description)}</small></span>
                <span class="admin-tool__arrow" aria-hidden="true">›</span>
            </a>`).join('')}</div>
        </section>`).join('')}</div>
        <p class="admin-version">Versión Laravel ${esc(document.documentElement.dataset.appVersion || '13')}</p>
    </section>`;
}

function restrictedPage() {
    return `<section class="page">${pageHeader('Acceso restringido')}<div class="card">${stateView('error', 'Acceso restringido', 'Inicia sesión como administrador desde la Zona míster.', `<a class="btn" href="/inicio">Volver al inicio</a>`)}</div></section>`;
}

function renderDialog() {
    const dialog = state.dialog;
    const closingClass = dialog.closing ? ' dialog-backdrop--closing' : '';
    const panelClosingClass = dialog.closing ? ' dialog--closing' : '';
    if (dialog.variant === 'ranking-info') {
        return `<div class="dialog-backdrop dialog-backdrop--ranking-info${closingClass}" role="presentation"><section class="dialog dialog--ranking-info${panelClosingClass}" role="dialog" aria-modal="true" aria-labelledby="dialog-title" aria-describedby="dialog-description">
            <div class="ranking-dialog__accent" aria-hidden="true"></div>
            <header class="ranking-dialog__header">
                <span class="ranking-dialog__symbol" aria-hidden="true">${esc(dialog.symbol || '⚽')}</span>
                <div class="ranking-dialog__heading">
                    <span class="ranking-dialog__eyebrow">Criterio de clasificación</span>
                    <h2 id="dialog-title">${esc(dialog.title)}</h2>
                </div>
                <button class="ranking-dialog__close" type="button" data-action="dialog-confirm" aria-label="Cerrar información">${icon('close')}</button>
            </header>
            <div class="ranking-dialog__body">
                <span class="ranking-dialog__info-icon" aria-hidden="true">${icon('info')}</span>
                <div>
                    <strong>Cómo funciona</strong>
                    <p id="dialog-description">${esc(dialog.message)}</p>
                </div>
            </div>
            <div class="dialog__actions ranking-dialog__actions">
                <button class="btn ranking-dialog__button" data-action="dialog-confirm">${esc(dialog.confirmLabel || 'Entendido')}</button>
            </div>
        </section></div>`;
    }
    return `<div class="dialog-backdrop${closingClass}" role="presentation"><section class="dialog${panelClosingClass}" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
        <h2 id="dialog-title">${esc(dialog.title)}</h2>${dialog.content || `<p>${esc(dialog.message)}</p>`}
        <div class="dialog__actions">${dialog.singleAction ? '' : `<button class="btn btn--text" data-action="dialog-cancel">${esc(dialog.cancelLabel || 'Cancelar')}</button>`}
        <button class="btn ${dialog.danger ? 'btn--danger' : ''}" data-action="dialog-confirm">${esc(dialog.confirmLabel || 'Aceptar')}</button></div>
    </section></div>`;
}

function confirmDiscard(onDiscard) {
    state.dialog = {
        title: 'Hay cambios sin guardar',
        message: 'Si sales ahora, perderás los cambios realizados.',
        cancelLabel: 'Seguir editando',
        confirmLabel: 'Descartar y salir',
        danger: true,
        onConfirm: () => {
            state.unsaved = false;
            state.matchDraft = null;
            onDiscard();
        },
    };
    render();
}

function cleanupProfileMotion() {
    profileMotionGeneration += 1;
    profileMotionModule?.cleanupProfileDashboardMotion();
}

async function activateProfileMotion() {
    if (!root.querySelector('.profile-dashboard-grid') || prefersReducedMotion()) return;

    const generation = ++profileMotionGeneration;
    const motionModule = profileMotionModule || await import('./profile-motion');
    if (generation !== profileMotionGeneration) return;

    profileMotionModule = motionModule;
    motionModule.setupProfileDashboardMotion(root);
}

function render() {
    cleanupProfileMotion();
    if (!state.client || (!state.session && !['invite', 'recovery'].includes(state.authMode))) {
        renderAuth();
        return;
    }
    if (!state.access) {
        if (['invite', 'recovery'].includes(state.authMode)) renderAuth();
        else renderAccessCheck();
        return;
    }
    const route = currentRoute();
    let page;
    if (route === '/inicio') page = renderHome();
    else if (route === '/partidos') page = renderHistory();
    else if (route === '/rankings') page = renderRankings();
    else if (route === '/perfil') page = renderOwnProfile();
    else if (route === '/mister') page = renderAdmin();
    else if (route === '/mister/partidos') page = renderManageMatches();
    else if (route === '/mister/jugadores') page = renderManagePlayers();
    else if (route === '/mister/partidos/nuevo') page = renderMatchForm();
    else if (route === '/mister/jugadores/nuevo') page = renderPlayerForm();
    else if (route === '/mister/invitacion') page = renderInvitation();
    else if (route === '/mister/equipos') page = renderRandomizer();
    else if (route === '/mister/equipos/resultado') page = renderRandomizerResult();
    else if (route.startsWith('/mister/partidos/')) page = renderMatchForm(fromHex(route.split('/').pop()));
    else if (route.startsWith('/mister/jugadores/')) page = renderPlayerForm(fromHex(route.split('/').pop()));
    else if (route.startsWith('/partidos/')) page = renderMatchDetail(fromHex(route.split('/').pop()));
    else if (route.startsWith('/rankings/jugador/')) page = renderPlayerProfile(fromHex(route.split('/').pop()));
    else {
        navigate('/inicio', true);
        return;
    }
    const routeMotion = shouldAnimateRoute(lastRenderedRoute, route);
    root.innerHTML = shell(page, { routeMotion });
    void activateProfileMotion();
    lastRenderedRoute = route;
    state.selectionMotion = null;
}

async function initialize() {
    if (!config.supabaseUrl || !config.supabasePublishableKey) {
        state.authError = 'Falta la configuración local de Supabase en este dispositivo.';
        renderAuth();
        return;
    }
    state.client = createClient(config.supabaseUrl, config.supabasePublishableKey, {
        auth: {
            persistSession: true,
            storage: window.sessionStorage,
            autoRefreshToken: true,
            detectSessionInUrl: true,
            flowType: 'implicit',
        },
    });
    let session;

    try {
        const response = await withTimeout(
            state.client.auth.getSession(),
            AUTH_BOOT_TIMEOUT_MS,
            'AUTH_BOOT_TIMEOUT',
        );
        session = response.data.session;
    } catch (error) {
        if (error?.message === 'AUTH_BOOT_TIMEOUT') {
            clearPersistedAuthSession();

            if (window.sessionStorage.getItem(AUTH_BOOT_RESET_KEY) !== '1') {
                window.sessionStorage.setItem(AUTH_BOOT_RESET_KEY, '1');
                window.location.reload();
                return;
            }

            state.loading = false;
            state.authError = errorMessage(error);
            renderAuth();
            return;
        }

        throw error;
    }

    window.sessionStorage.removeItem(AUTH_BOOT_RESET_KEY);
    state.session = session;
    state.client.auth.onAuthStateChange((event, nextSession) => {
        state.session = nextSession;
        if (event === 'PASSWORD_RECOVERY') state.authMode = 'recovery';
    });
    if (['invite', 'recovery'].includes(state.authMode)) {
        renderAuth();
        return;
    }
    if (!session) {
        state.loading = false;
        renderAuth();
        return;
    }
    await authorizeAndLoad();
}

async function authorizeAndLoad() {
    renderAccessCheck();
    try {
        const access = await rpc('get_current_user_access');
        state.access = normalizeAccess(access);
        if (!state.access) {
            resetAvatarState();
            await state.client.auth.signOut({ scope: 'local' });
            state.session = null;
            state.authError = 'Esta cuenta no pertenece a la liga o todavía no está activa.';
            renderAuth();
            return;
        }
        state.seasons = [];
        state.selectedSeasonId = null;
        loadUserPreferences();
        if (location.pathname === '/') navigate('/inicio', true);
        await loadApplicationData();
    } catch (error) {
        resetAvatarState();
        state.access = null;
        state.authError = errorMessage(error, 'No se ha podido comprobar tu acceso a la liga. Inténtalo de nuevo.');
        await state.client.auth.signOut({ scope: 'local' }).catch(() => {});
        state.session = null;
        renderAuth();
    }
}

/* Admin renderers are declared below to keep every client route in one bundle. */

async function loadAdminPlayers() {
    if (!isAdmin()) return;
    state.adminPlayers = 'loading';
    render();
    try {
        state.adminPlayers = await rpc('get_admin_players');
    } catch (error) {
        state.adminPlayers = { error: errorMessage(error, 'No se han podido cargar los jugadores. Inténtalo de nuevo.') };
    }
    render();
}

async function loadAdminMatches() {
    if (!isAdmin()) return;
    state.adminMatches = 'loading';
    render();
    try {
        state.adminMatches = await rpc('get_admin_friendly_matches');
    } catch (error) {
        state.adminMatches = { error: errorMessage(error, 'No se han podido cargar los partidos. Inténtalo de nuevo.') };
    }
    render();
}

function renderManagePlayers() {
    if (!isAdmin()) return restrictedPage();
    if (state.adminPlayers == null) {
        queueMicrotask(loadAdminPlayers);
        return pageLoading('Gestionar jugadores');
    }
    if (state.adminPlayers === 'loading') return pageLoading('Gestionar jugadores');
    if (state.adminPlayers.error) {
        return `<section class="page">${pageHeader('Gestionar jugadores', 'Busca, activa, desactiva o edita jugadores; el borrado queda reservado a perfiles sin historial.')}
            <div class="card">${stateView('error', 'No se han podido cargar los jugadores', state.adminPlayers.error, '<button class="btn" data-action="reload-admin-players">Reintentar</button>')}</div></section>`;
    }
    const filter = state.managePlayersFilter;
    const allPlayers = [...state.adminPlayers];
    const players = allPlayers
        .filter((player) => player.name.toLowerCase().includes(filter.search.toLowerCase()))
        .filter((player) => filter.status === 'active' ? player.is_active : filter.status === 'inactive' ? !player.is_active : filter.status === 'cardio' ? player.has_cardio : true)
        .sort((a, b) => (filter.order === 'za' ? -1 : 1) * a.name.localeCompare(b.name, 'es'));
    return `<section class="page stack stack--wide manager-page manager-page--listing">
        ${pageHeader('Gestionar jugadores', 'Busca, activa, desactiva o edita jugadores; el borrado queda reservado a perfiles sin historial.', `<a class="btn btn--compact" href="/mister/jugadores/nuevo">${icon('plus')} Añadir jugador</a>`)}
        <form id="manage-players-filter" class="card card__body form-grid manager-filter">
            <label class="field"><span>Buscar jugador</span><input class="input" name="search" value="${esc(filter.search)}" placeholder="Nombre del jugador"></label>
            <label class="field"><span>Estado</span><select class="select" name="status">
                <option value="all" ${filter.status === 'all' ? 'selected' : ''}>Todos</option><option value="active" ${filter.status === 'active' ? 'selected' : ''}>Activos</option><option value="inactive" ${filter.status === 'inactive' ? 'selected' : ''}>Inactivos</option><option value="cardio" ${filter.status === 'cardio' ? 'selected' : ''}>Con cardio</option>
            </select></label>
            <label class="field"><span>Orden</span><select class="select" name="order"><option value="az" ${filter.order === 'az' ? 'selected' : ''}>Orden A–Z</option><option value="za" ${filter.order === 'za' ? 'selected' : ''}>Orden Z–A</option></select></label>
            <button class="btn btn--outline" type="submit">Filtrar</button>
        </form>
        <p class="eyebrow manager-results-count"><strong>${players.length}</strong> de ${allPlayers.length} jugadores</p>
        ${players.length ? `<div class="data-table-wrap manager-table manager-player-table"><table class="data-table">
            <thead><tr><th>Jugador</th><th>Estado</th><th class="optional">Cardio</th><th><span class="visually-hidden">Acciones</span></th></tr></thead>
            <tbody>${players.map((player) => `<tr>
                <td data-label="Jugador"><div class="inline">${avatar({ id: player.id, name: player.name })}<strong>${esc(player.name)}</strong></div></td>
                <td data-label="Estado"><span class="status-badge ${player.is_active ? 'status-badge--success' : ''}">${player.is_active ? 'Activo' : 'Inactivo'}</span></td>
                <td class="optional" data-label="Cardio">${player.has_cardio ? 'Sí' : 'No'}</td>
                <td data-label="Acciones"><div class="table-actions">
                    <a class="icon-btn" href="/mister/jugadores/${toHex(player.id)}" aria-label="Editar ${esc(player.name)}">${icon('edit')}</a>
                    <button class="btn btn--outline btn--compact" type="button" data-action="toggle-player-active" data-id="${esc(player.id)}" data-active="${player.is_active}">${player.is_active ? 'Desactivar jugador' : 'Activar jugador'}</button>
                    <button class="icon-btn" type="button" data-action="delete-player" data-id="${esc(player.id)}" data-name="${esc(player.name)}" aria-label="Borrar ${esc(player.name)}">${icon('trash')}</button>
                </div></td>
            </tr>`).join('')}</tbody>
        </table></div>` : `<div class="card">${stateView('empty', allPlayers.length ? 'No hay jugadores que coincidan con los filtros.' : 'No hay jugadores para gestionar.', allPlayers.length ? 'Prueba otro nombre o cambia el estado seleccionado.' : 'Añade el primer jugador para empezar a preparar la liga.', allPlayers.length ? '' : '<a class="btn" href="/mister/jugadores/nuevo">Añadir jugador</a>')}</div>`}
    </section>`;
}

function renderPlayerForm(id = '') {
    if (!isAdmin()) return restrictedPage();
    if (id && (state.adminPlayers == null || state.adminPlayers === 'loading')) {
        if (state.adminPlayers == null) queueMicrotask(loadAdminPlayers);
        return pageLoading('Editar jugador');
    }
    const player = id && Array.isArray(state.adminPlayers) ? state.adminPlayers.find((item) => item.id === id) : null;
    if (id && !player) {
        return `<section class="page">${pageHeader('Editar jugador')}<div class="card">${stateView('error', 'Jugador no encontrado', 'No se ha podido abrir este jugador.', '<button class="btn" data-action="back">Volver</button>')}</div></section>`;
    }
    const editing = Boolean(player);
    return `<section class="page stack stack--wide manager-page manager-page--form">
        ${pageHeader(editing ? 'Editar jugador' : 'Añadir jugador', editing ? 'Actualiza el nombre del jugador.' : 'Da de alta un jugador para la liga.')}
        <form id="player-form" class="card card__body--large form-card stack manager-form manager-form--compact" data-id="${esc(id)}">
            <header class="manager-form__header">
                <span class="manager-form__icon" aria-hidden="true">${icon('profile')}</span>
                <div><span>Ficha de plantilla</span><h2>${editing ? 'Datos del jugador' : 'Nuevo jugador'}</h2></div>
            </header>
            <label class="field manager-field"><span>Nombre del jugador</span><input class="input" name="name" maxlength="80" value="${esc(player?.name || '')}" placeholder="Nombre y apellidos" required></label>
            <div class="switch-row manager-switch-row">
                <div><strong>Está en buena forma física</strong><div class="muted">Ayuda a equilibrar los equipos en el generador.</div></div>
                <label class="switch"><input name="has_cardio" type="checkbox" ${player?.has_cardio ? 'checked' : ''}><span class="switch__track"></span></label>
            </div>
            <footer class="manager-form__actions"><button class="btn btn--text" type="button" data-action="back">Cancelar</button><button class="btn" type="submit">Guardar jugador</button></footer>
        </form>
    </section>`;
}

function renderManageMatches() {
    if (!isAdmin()) return restrictedPage();
    if (state.adminMatches == null) {
        queueMicrotask(loadAdminMatches);
        return pageLoading('Gestionar partidos');
    }
    if (state.adminMatches === 'loading') return pageLoading('Gestionar partidos');
    if (state.adminMatches.error) {
        return `<section class="page">${pageHeader('Gestionar partidos', 'Corrige resultados o elimina actas.')}
            <div class="card">${stateView('error', 'No se han podido cargar los partidos', state.adminMatches.error, '<button class="btn" data-action="reload-admin-matches">Reintentar</button>')}</div></section>`;
    }
    const filter = state.manageMatchesFilter;
    const allMatches = [...state.adminMatches];
    const matches = allMatches
        .filter((match) => {
            const haystack = `${formatDate(match.played_on)} ${match.team_a_score}-${match.team_b_score}`.toLowerCase();
            return haystack.includes(filter.search.toLowerCase());
        })
        .filter((match) => filter.type === 'draws'
            ? Number(match.team_a_score) === Number(match.team_b_score)
            : filter.type === 'penalties'
                ? match.team_a_penalty_score != null
                : true)
        .sort((a, b) => (filter.order === 'oldest' ? 1 : -1) * a.played_on.localeCompare(b.played_on));
    return `<section class="page stack stack--wide manager-page manager-page--listing">
        ${pageHeader('Gestionar partidos', 'Encuentra, edita o borra actas y sus datos asociados.', `<a class="btn btn--compact" href="/mister/partidos/nuevo">${icon('plus')} Nuevo partido</a>`)}
        <form id="manage-matches-filter" class="card card__body form-grid manager-filter">
            <label class="field"><span>Buscar por fecha o resultado</span><input class="input" name="search" value="${esc(filter.search)}" placeholder="Fecha o resultado"></label>
            <label class="field"><span>Tipo de partido</span><select class="select" name="type"><option value="all" ${filter.type === 'all' ? 'selected' : ''}>Todos</option><option value="draws" ${filter.type === 'draws' ? 'selected' : ''}>Empates</option><option value="penalties" ${filter.type === 'penalties' ? 'selected' : ''}>Con penaltis</option></select></label>
            <label class="field"><span>Orden</span><select class="select" name="order"><option value="newest" ${filter.order === 'newest' ? 'selected' : ''}>Orden: recientes</option><option value="oldest" ${filter.order === 'oldest' ? 'selected' : ''}>Orden: antiguos</option></select></label>
            <button class="btn btn--outline" type="submit">Filtrar</button>
        </form>
        <p class="eyebrow manager-results-count"><strong>${matches.length}</strong> de ${allMatches.length} partidos</p>
        ${matches.length ? `<div class="data-table-wrap manager-table manager-match-table"><table class="data-table">
            <thead><tr><th>Fecha</th><th>Resultado</th><th class="optional">Penaltis</th><th><span class="visually-hidden">Acciones</span></th></tr></thead>
            <tbody>${matches.map((match) => `<tr>
                <td data-label="Fecha">${esc(formatDate(match.played_on))}</td><td data-label="Resultado"><strong class="gold">${match.team_a_score} - ${match.team_b_score}</strong></td>
                <td class="optional" data-label="Penaltis">${match.team_a_penalty_score == null ? '—' : `${match.team_a_penalty_score} - ${match.team_b_penalty_score}`}</td>
                <td data-label="Acciones"><div class="table-actions"><a class="icon-btn" href="/mister/partidos/${toHex(match.id)}" aria-label="Editar partido">${icon('edit')}</a>
                    <button class="icon-btn" type="button" data-action="delete-match" data-id="${esc(match.id)}" data-date="${esc(formatDate(match.played_on))}" aria-label="Borrar partido">${icon('trash')}</button></div></td>
            </tr>`).join('')}</tbody>
        </table></div>` : `<div class="card">${stateView('empty', allMatches.length ? 'No hay partidos que coincidan con los filtros.' : 'No hay partidos para gestionar.', allMatches.length ? 'Prueba otra búsqueda o cambia el tipo de partido.' : 'Crea la primera acta de la liga.', allMatches.length ? '' : '<a class="btn" href="/mister/partidos/nuevo">Nuevo partido</a>')}</div>`}
    </section>`;
}

function blankMatchDraft(id = '') {
    return {
        id,
        loadedFor: id || 'new',
        date: new Date().toISOString().slice(0, 10),
        scoreA: '0',
        scoreB: '0',
        penalties: false,
        penaltyA: '0',
        penaltyB: '0',
        players: [],
        assignments: {},
        goalkeepers: {},
        goals: [{ playerId: '', team: 'A', count: 1, ownGoal: false }],
        loading: true,
        error: '',
        draftLoaded: false,
    };
}

async function prepareMatchDraft(id = '') {
    state.matchDraft = blankMatchDraft(id);
    state.matchStep = 1;
    render();
    try {
        const [players, reportRows] = await Promise.all([
            rpc('get_active_players'),
            id ? rpc('get_friendly_match_acta', { p_match_id: id }) : Promise.resolve([]),
        ]);
        state.matchDraft.players = players || [];
        if (id) {
            const report = Array.isArray(reportRows) ? reportRows[0] : reportRows;
            if (!report) throw new Error('Acta no encontrada');
            state.matchDraft.date = report.match_date;
            state.matchDraft.scoreA = String(report.team_a_score);
            state.matchDraft.scoreB = String(report.team_b_score);
            state.matchDraft.penalties = report.team_a_penalty_score != null;
            state.matchDraft.penaltyA = String(report.team_a_penalty_score ?? 0);
            state.matchDraft.penaltyB = String(report.team_b_penalty_score ?? 0);
            for (const participant of report.participants || []) {
                const teams = state.matchDraft.assignments[participant.player_id] || [];
                if (!teams.includes(participant.team)) teams.push(participant.team);
                state.matchDraft.assignments[participant.player_id] = teams;
                state.matchDraft.goalkeepers[`${participant.player_id}:${participant.team}`] = Boolean(participant.was_goalkeeper);
            }
            state.matchDraft.goals = (report.goals || []).map((goal) => ({
                playerId: goal.player_id,
                team: goal.team,
                count: Number(goal.count),
                ownGoal: Boolean(goal.is_own_goal),
            }));
            if (!state.matchDraft.goals.length) state.matchDraft.goals = [{ playerId: '', team: 'A', count: 1, ownGoal: false }];
        } else {
            try {
                const saved = JSON.parse(localStorage.getItem('hattitriki-match-teams-draft') || 'null');
                const activeIds = new Set(state.matchDraft.players.map((player) => player.id));
                if (saved?.teamA?.length && saved?.teamB?.length) {
                    for (const playerId of saved.teamA.filter((playerId) => activeIds.has(playerId))) {
                        state.matchDraft.assignments[playerId] = [...(state.matchDraft.assignments[playerId] || []), 'A'];
                    }
                    for (const playerId of saved.teamB.filter((playerId) => activeIds.has(playerId))) {
                        state.matchDraft.assignments[playerId] = [...(state.matchDraft.assignments[playerId] || []), 'B'];
                    }
                    state.matchDraft.draftLoaded = true;
                }
            } catch {
                localStorage.removeItem('hattitriki-match-teams-draft');
            }
        }
        state.matchDraft.loading = false;
    } catch (error) {
        state.matchDraft.loading = false;
        state.matchDraft.error = errorMessage(error, 'No se ha podido preparar el acta.');
    }
    render();
}

function renderMatchForm(id = '') {
    if (!isAdmin()) return restrictedPage();
    const key = id || 'new';
    if (!state.matchDraft || state.matchDraft.loadedFor !== key) {
        queueMicrotask(() => prepareMatchDraft(id));
        return pageLoading(id ? 'Editar acta' : 'Nueva acta');
    }
    const draft = state.matchDraft;
    if (draft.loading) return pageLoading(id ? 'Editar acta' : 'Nueva acta');
    if (draft.error) return `<section class="page">${pageHeader(id ? 'Editar acta' : 'Nueva acta')}<div class="card">${stateView('error', 'No se puede abrir el acta', draft.error, '<button class="btn" data-action="retry-match-draft">Reintentar</button>')}</div></section>`;
    const animateStep = matchStepMotionPending && !prefersReducedMotion();
    matchStepMotionPending = false;
    const assigned = Object.values(draft.assignments).filter((teams) => teams?.length).length;
    const complete = [
        hasValidMatchBasics(draft),
        hasValidMatchBasics(draft) && hasValidMatchTeams(draft),
        hasValidMatchBasics(draft) && hasValidMatchTeams(draft) && hasValidMatchGoals(draft),
    ];
    return `<section class="page stack stack--wide match-editor-page manager-page manager-page--editor">
        ${pageHeader(id ? 'Editar acta' : 'Nueva acta', id ? 'Revisa el partido paso a paso y guarda los cambios.' : 'Completa partido, equipos y goles en tres pasos.')}
        <nav class="stepper" aria-label="Pasos del acta">
            ${[['Partido', 1], ['Equipos', 2], ['Goles', 3]].map(([label, number]) => {
                const canOpen = number === 1 || (number === 2 ? complete[0] : complete[1]);
                return `<button class="step ${state.matchStep === number ? 'step--active' : ''} ${complete[number - 1] ? 'step--done' : ''}" type="button" data-action="match-step" data-step="${number}" ${state.matchStep === number ? 'aria-current="step"' : ''} ${canOpen ? '' : 'disabled'}><span class="step__number">${complete[number - 1] ? '✓' : number}</span><span class="step__copy"><small>Paso ${number}</small><span class="step__label">${label}</span></span></button>`;
            }).join('')}
        </nav>
        <form id="match-form" class="card form-card match-editor" data-id="${esc(id)}">
            <div class="match-editor__body${animateStep ? ' match-editor__body--motion-enter' : ''}">
                ${draft.draftLoaded ? '<div class="auth-message auth-success">Se han cargado los equipos guardados en el generador. <button class="btn btn--text btn--compact" type="button" data-action="discard-team-draft">Descartar borrador y vaciar equipos</button></div>' : ''}
                ${state.matchStep === 1 ? renderMatchBasics(draft) : state.matchStep === 2 ? renderMatchTeams(draft) : renderMatchGoals(draft)}
            </div>
            <footer class="match-editor__actions">
                <button class="btn btn--text" type="button" data-action="${state.matchStep === 1 ? 'back' : 'match-previous'}">${state.matchStep === 1 ? 'Cancelar' : 'Atrás'}</button>
                ${state.matchStep < 3 ? `<button class="btn" type="button" data-action="match-next">${state.matchStep === 1 ? 'Continuar' : `Continuar · ${assigned} jugadores`}</button>` : '<button class="btn" type="submit">Guardar acta</button>'}
            </footer>
        </form>
    </section>`;
}

function renderMatchBasics(draft) {
    return `<div class="stack"><h2 class="section-heading">Partido</h2><div class="form-grid">
        <label class="field field--span"><span>Fecha</span><input class="input" name="date" type="date" value="${esc(draft.date)}" required></label>
        <label class="field"><span>Goles Equipo A</span><input class="input" name="scoreA" type="number" min="0" value="${esc(draft.scoreA)}" required></label>
        <label class="field"><span>Goles Equipo B</span><input class="input" name="scoreB" type="number" min="0" value="${esc(draft.scoreB)}" required></label>
    </div>
    <div class="switch-row"><div><strong>${draft.penalties ? '✓ Decidido en penaltis' : '¿Se decidió en penaltis?'}</strong><div class="muted">La tanda debe tener un ganador y no suma goles al marcador.</div></div><label class="switch"><input name="penalties" type="checkbox" ${draft.penalties ? 'checked' : ''}><span class="switch__track"></span></label></div>
    ${draft.penalties ? `<div class="form-grid"><label class="field"><span>Penaltis Equipo A</span><input class="input" name="penaltyA" type="number" min="0" value="${esc(draft.penaltyA)}"></label><label class="field"><span>Penaltis Equipo B</span><input class="input" name="penaltyB" type="number" min="0" value="${esc(draft.penaltyB)}"></label></div>` : ''}</div>`;
}

function renderMatchTeams(draft) {
    return `<div class="stack"><div><h2 class="section-heading">Equipos y porteros</h2><p class="muted">Selecciona los jugadores de cada equipo. Un jugador puede participar en ambos.</p></div>
        <div class="selection-grid">${draft.players.map((player) => {
            const teams = draft.assignments[player.id] || [];
            return `<div class="select-player"><span class="ranking-name">${esc(player.name)}</span>
                <span class="team-choice"><label><input type="checkbox" data-match-field="team" data-team="A" data-player="${esc(player.id)}" ${teams.includes('A') ? 'checked' : ''}> A</label>
                    <label title="Portero del Equipo A"><input type="checkbox" data-match-field="goalkeeper" data-team="A" data-player="${esc(player.id)}" ${draft.goalkeepers[`${player.id}:A`] ? 'checked' : ''} ${!teams.includes('A') ? 'disabled' : ''}> 🧤</label></span>
                <span class="team-choice"><label><input type="checkbox" data-match-field="team" data-team="B" data-player="${esc(player.id)}" ${teams.includes('B') ? 'checked' : ''}> B</label>
                    <label title="Portero del Equipo B"><input type="checkbox" data-match-field="goalkeeper" data-team="B" data-player="${esc(player.id)}" ${draft.goalkeepers[`${player.id}:B`] ? 'checked' : ''} ${!teams.includes('B') ? 'disabled' : ''}> 🧤</label></span>
            </div>`;
        }).join('')}</div>
    </div>`;
}

function nonNegativeInteger(value) {
    if (value === '' || value == null) return null;
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function validIsoDate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
    if (!match) return false;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    return year >= 1 && date.getUTCFullYear() === year
        && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function hasValidMatchBasics(draft) {
    const scoreA = nonNegativeInteger(draft.scoreA);
    const scoreB = nonNegativeInteger(draft.scoreB);
    if (!validIsoDate(draft.date) || scoreA == null || scoreB == null) return false;
    if (!draft.penalties) return true;
    const penaltyA = nonNegativeInteger(draft.penaltyA);
    const penaltyB = nonNegativeInteger(draft.penaltyB);
    return scoreA === scoreB && penaltyA != null && penaltyB != null && penaltyA !== penaltyB;
}

function hasValidMatchTeams(draft) {
    const teams = ['A', 'B'];
    return teams.every((team) => draft.players.some((player) =>
        draft.assignments[player.id]?.includes(team)))
        && teams.every((team) => draft.players.some((player) =>
            draft.assignments[player.id]?.includes(team)
            && draft.goalkeepers[`${player.id}:${team}`]));
}

function completeMatchGoals(draft) {
    return draft.goals.filter((goal) =>
        goal.playerId && nonNegativeInteger(goal.count) > 0);
}

function hasValidMatchGoals(draft) {
    const goals = completeMatchGoals(draft);
    const total = (team) => goals
        .filter((goal) => goal.team === team)
        .reduce((sum, goal) => sum + Number(goal.count), 0);
    if (total('A') !== nonNegativeInteger(draft.scoreA)
        || total('B') !== nonNegativeInteger(draft.scoreB)) return false;
    return goals.every((goal) => {
        const scorerTeam = goal.ownGoal ? (goal.team === 'A' ? 'B' : 'A') : goal.team;
        return draft.assignments[goal.playerId]?.includes(scorerTeam);
    });
}

function matchStepRequirement(draft, step) {
    if (step === 1) {
        if (!validIsoDate(draft.date)) return 'Introduce una fecha válida.';
        if (nonNegativeInteger(draft.scoreA) == null || nonNegativeInteger(draft.scoreB) == null) {
            return 'Introduce un marcador válido para los dos equipos.';
        }
        if (!hasValidMatchBasics(draft)) return 'Revisa el resultado de la tanda de penaltis.';
        return '';
    }
    if (!draft.players.some((player) => draft.assignments[player.id]?.includes('A'))) {
        return 'Selecciona al menos un jugador del Equipo A.';
    }
    if (!draft.players.some((player) => draft.assignments[player.id]?.includes('B'))) {
        return 'Selecciona al menos un jugador del Equipo B.';
    }
    if (!draft.players.some((player) => draft.assignments[player.id]?.includes('A')
        && draft.goalkeepers[`${player.id}:A`])) return 'Selecciona un portero del Equipo A.';
    if (!draft.players.some((player) => draft.assignments[player.id]?.includes('B')
        && draft.goalkeepers[`${player.id}:B`])) return 'Selecciona un portero del Equipo B.';
    return '';
}

function renderMatchGoals(draft) {
    const assignedPlayers = draft.players.filter((player) => draft.assignments[player.id]?.length);
    const goals = completeMatchGoals(draft);
    const assignedA = goals.filter((goal) => goal.team === 'A').reduce((total, goal) => total + Number(goal.count), 0);
    const assignedB = goals.filter((goal) => goal.team === 'B').reduce((total, goal) => total + Number(goal.count), 0);
    return `<div class="stack"><div><h2 class="section-heading">Goles</h2><p class="muted">Asigna el marcador entre los goleadores.</p></div>
        <div class="summary-grid">
            <div class="mini-stat"><span>Equipo A</span><strong>${assignedA} / ${nonNegativeInteger(draft.scoreA) ?? 0}</strong><small>goles asignados</small></div>
            <div class="mini-stat"><span>Equipo B</span><strong>${assignedB} / ${nonNegativeInteger(draft.scoreB) ?? 0}</strong><small>goles asignados</small></div>
        </div>
        <div id="goal-rows" class="stack">${draft.goals.map((goal, index) => `<div class="card card__body form-grid match-goal-row" data-goal-index="${index}">
            <label class="field"><span>${goal.ownGoal ? 'Jugador que marca en propia' : 'Goleador'}</span><select class="select" data-goal-field="playerId" data-index="${index}"><option value="">Elegir jugador</option>${assignedPlayers.filter((player) => {
                const scorerTeam = goal.ownGoal ? (goal.team === 'A' ? 'B' : 'A') : goal.team;
                return draft.assignments[player.id]?.includes(scorerTeam);
            }).map((player) => `<option value="${esc(player.id)}" ${goal.playerId === player.id ? 'selected' : ''}>${esc(player.name)}</option>`).join('')}</select></label>
            <label class="field"><span>Equipo</span><select class="select" data-goal-field="team" data-index="${index}"><option ${goal.team === 'A' ? 'selected' : ''}>A</option><option ${goal.team === 'B' ? 'selected' : ''}>B</option></select></label>
            <label class="field"><span>Cantidad</span><input class="input" data-goal-field="count" data-index="${index}" type="number" min="1" value="${esc(goal.count)}"></label>
            <label class="inline"><input type="checkbox" data-goal-field="ownGoal" data-index="${index}" ${goal.ownGoal ? 'checked' : ''}> Es un autogol</label>
            <button class="btn btn--danger btn--compact" type="button" data-action="remove-goal" data-index="${index}">${icon('trash')} Quitar</button>
        </div>`).join('')}</div>
        <button class="btn btn--outline" type="button" data-action="add-goal">${icon('plus')} Añadir gol</button>
    </div>`;
}

async function saveMatchDraft(id) {
    const draft = state.matchDraft;
    const participants = draft.players.flatMap((player) =>
        (draft.assignments[player.id] || []).map((team) => ({
            player_id: player.id,
            team,
            was_goalkeeper: Boolean(draft.goalkeepers[`${player.id}:${team}`]),
        })));
    const goals = completeMatchGoals(draft).map((goal) => ({
        player_id: goal.playerId,
        team: goal.team,
        count: Number(goal.count),
        is_own_goal: Boolean(goal.ownGoal),
    }));
    const params = {
        p_match_date: draft.date,
        p_team_a_score: Number(draft.scoreA),
        p_team_b_score: Number(draft.scoreB),
        p_team_a_penalty_score: draft.penalties ? Number(draft.penaltyA) : null,
        p_team_b_penalty_score: draft.penalties ? Number(draft.penaltyB) : null,
        p_players: participants,
        p_goals: goals,
    };
    if (!hasValidMatchBasics(draft)) {
        showSnackbar(matchStepRequirement(draft, 1), true);
        return;
    }
    if (!hasValidMatchTeams(draft)) {
        showSnackbar(matchStepRequirement(draft, 2), true);
        return;
    }
    const assignedA = goals.filter((goal) => goal.team === 'A').reduce((total, goal) => total + goal.count, 0);
    const assignedB = goals.filter((goal) => goal.team === 'B').reduce((total, goal) => total + goal.count, 0);
    if (assignedA !== Number(draft.scoreA) || assignedB !== Number(draft.scoreB)) {
        showSnackbar('Los goles asignados deben coincidir con el marcador de cada equipo.', true);
        return;
    }
    if (!hasValidMatchGoals(draft)) {
        showSnackbar('Revisa los goleadores seleccionados.', true);
        return;
    }
    try {
        if (id) await rpc('update_friendly_match_acta', { p_match_id: id, ...params });
        else await rpc('create_friendly_match_acta', params);
        if (!id) localStorage.removeItem('hattitriki-match-teams-draft');
        state.unsaved = false;
        state.matchDraft = null;
        state.adminMatches = null;
        await loadApplicationData();
        navigate('/mister/partidos');
        showSnackbar(id ? 'Partido actualizado' : 'Partido guardado');
    } catch (error) {
        showSnackbar(errorMessage(error, id ? 'No se ha podido actualizar el acta.' : 'No se ha podido guardar el acta.'), true);
    }
}

async function loadInvitablePlayers() {
    state.invitablePlayers = 'loading';
    render();
    try {
        state.invitablePlayers = await rpc('get_invitable_players');
    } catch (error) {
        state.invitablePlayers = { error: errorMessage(error, 'No se han podido cargar los jugadores disponibles.') };
    }
    render();
}

function renderInvitation() {
    if (!isAdmin()) return restrictedPage();
    if (state.invitablePlayers == null) {
        queueMicrotask(loadInvitablePlayers);
        return pageLoading('Invitar a la liga');
    }
    if (state.invitablePlayers === 'loading') return pageLoading('Invitar a la liga');
    if (state.invitablePlayers.error) return `<section class="page">${pageHeader('Invitar a la liga')}<div class="card">${stateView('error', 'No se ha podido preparar la invitación', state.invitablePlayers.error, '<button class="btn" data-action="reload-invitable">Reintentar</button>')}</div></section>`;
    if (state.invitationSuccess) {
        return `<section class="page stack stack--wide manager-page manager-page--form">${pageHeader('Invitación enviada', 'El acceso a la liga está en camino.')}
            <div class="card card--highlight card__body--large empty-state manager-success"><div><div class="state-icon">${icon('mail')}</div><h2 class="state-title">Invitación enviada</h2>
            <p class="state-copy">${esc(state.invitationSuccess.playerName)} recibirá el acceso en ${esc(state.invitationSuccess.email)}.</p>
            <p class="muted">El jugador ya no aparece entre las personas disponibles para evitar duplicados.</p>
            <div class="inline"><button class="btn btn--outline" data-action="invite-another">Invitar a otra persona</button><a class="btn" href="/mister">Volver a Zona míster</a></div></div></div>
        </section>`;
    }
    return `<section class="page stack stack--wide manager-page manager-page--form">
        ${pageHeader('Invitar y vincular', 'Da acceso a un jugador existente sin perder ni duplicar su historial.')}
        <form id="invitation-form" class="card form-card manager-form manager-form--invitation">
            <div class="manager-form__main">
                <header class="manager-form__header">
                    <span class="manager-form__icon" aria-hidden="true">${icon('mail')}</span>
                    <div><span>Alta de acceso</span><h2>Vincula jugador y cuenta</h2></div>
                </header>
                <label class="field manager-field">
                    <span><b>01</b> Elige al jugador</span>
                    <select class="select" name="player_id" required><option value="">Selecciona un jugador</option>${state.invitablePlayers.map((player) => `<option value="${esc(player.id)}">${esc(player.name)}</option>`).join('')}</select>
                    <small class="muted">Solo aparecen jugadores activos sin cuenta ni invitación pendiente.</small>
                </label>
                <label class="field manager-field">
                    <span><b>02</b> Correo electrónico</span>
                    <input class="input" name="email" type="email" inputmode="email" autocomplete="email" placeholder="jugador@ejemplo.com" required>
                </label>
            </div>
            <aside class="manager-form__aside">
                <span class="manager-form__aside-icon" aria-hidden="true">${icon('info')}</span>
                <strong>Qué ocurrirá después</strong>
                <p>El jugador recibirá un enlace seguro para elegir su contraseña.</p>
                <ul>
                    <li>Conservará todo su historial.</li>
                    <li>No se duplicará su ficha.</li>
                    <li>El enlace será personal.</li>
                </ul>
            </aside>
            <footer class="manager-form__actions">
                <button class="btn btn--text" type="button" data-action="back">Cancelar</button>
                <button class="btn" type="submit">${icon('mail')} Enviar acceso</button>
            </footer>
        </form>
    </section>`;
}

async function prepareRandomizer() {
    state.randomizer = { loading: true, error: '', players: [], selected: new Set(), teams: 2, balanceStats: false };
    render();
    try {
        const players = await rpc('get_active_players');
        state.randomizer.players = players || [];
        state.randomizer.selected = new Set((players || []).map((player) => player.id));
        state.randomizer.loading = false;
    } catch (error) {
        state.randomizer.loading = false;
        state.randomizer.error = errorMessage(error, 'No se ha podido cargar la plantilla.');
    }
    render();
}

async function refreshRandomizerPlayers() {
    const previousPlayers = state.randomizer?.players || [];
    const previousPlayerIds = new Set(previousPlayers.map((player) => player.id));
    const previousSelectedIds = state.randomizer?.selected || new Set();
    const players = await rpc('get_active_players');
    const nextPlayers = players || [];

    state.randomizer = {
        ...(state.randomizer || {
            loading: false,
            error: '',
            teams: 2,
            balanceStats: false,
        }),
        players: nextPlayers,
        selected: new Set(nextPlayers
            .filter((player) => !previousPlayerIds.has(player.id) || previousSelectedIds.has(player.id))
            .map((player) => player.id)),
        loading: false,
        error: '',
    };
    state.randomizer.teams = Math.min(
        state.randomizer.teams,
        Math.max(2, Math.min(MAX_RANDOMIZER_TEAMS, state.randomizer.selected.size)),
    );
}

function renderRandomizer() {
    if (!isAdmin()) return restrictedPage();
    if (!state.randomizer) {
        queueMicrotask(prepareRandomizer);
        return pageLoading('Generador de equipos');
    }
    const randomizer = state.randomizer;
    if (randomizer.loading) return pageLoading('Generador de equipos');
    if (randomizer.error) return `<section class="page">${pageHeader('Generador de equipos')}<div class="card">${stateView('error', 'No se ha podido cargar la plantilla', randomizer.error, '<button class="btn" data-action="retry-randomizer">Volver a intentar</button>')}</div></section>`;
    const selected = randomizer.selected.size;
    const setup = resolveRandomizerSetup(selected, randomizer.teams);
    const teamChoices = availableRandomizerTeamCounts();
    const selectedCardio = randomizer.players
        .filter((player) => randomizer.selected.has(player.id) && player.has_cardio)
        .length;
    return `<section class="page stack stack--wide manager-page manager-page--tools randomizer-page">
        ${pageHeader('Generador de equipos', 'Prepara la convocatoria y define cómo quieres repartir a los jugadores.')}
        <div class="randomizer-workspace">
            <section class="card randomizer-roster">
                <header class="randomizer-panel-header">
                    <div>
                        <span class="randomizer-panel-kicker">Paso 1 · Convocatoria</span>
                        <h2>¿Quién juega hoy?</h2>
                        <p>Selecciona a los jugadores disponibles para este partido.</p>
                    </div>
                    <strong class="randomizer-selection-count"><b>${selected}</b> / ${randomizer.players.length}</strong>
                </header>
                <div class="randomizer-roster-actions">
                    <span>${selectedCardio} con buen cardio</span>
                    <div>
                        <button class="btn btn--text btn--compact" type="button" data-action="randomizer-select-all">Seleccionar todos</button>
                        <button class="btn btn--text btn--compact" type="button" data-action="randomizer-select-none" ${selected ? '' : 'disabled'}>Limpiar</button>
                    </div>
                </div>
                ${randomizer.players.length ? `<div class="randomizer-player-grid">${randomizer.players.map((player) => {
                    const checked = randomizer.selected.has(player.id);
                    const motionSelected = checked && state.selectionMotion?.type === 'randomizer' && state.selectionMotion.id === player.id;
                    return `<label class="randomizer-player${checked ? ' randomizer-player--selected' : ''}${motionSelected ? ' randomizer-player--motion-selected' : ''}">
                        <input class="randomizer-player__input" type="checkbox" data-randomizer-player="${esc(player.id)}" ${checked ? 'checked' : ''}>
                        ${avatar({ id: player.id, name: player.name })}
                        <span class="randomizer-player__copy">
                            <span class="randomizer-player__name">
                                <strong>${esc(player.name)}</strong>
                                ${player.has_cardio ? '<span class="randomizer-player__cardio" title="Buen cardio" aria-hidden="true">⚡</span>' : ''}
                            </span>
                            <small>${player.has_cardio ? 'Buen cardio' : 'Jugador disponible'}</small>
                        </span>
                        <span class="randomizer-player__check" aria-hidden="true">${checked ? '✓' : ''}</span>
                    </label>`;
                }).join('')}</div>` : `<div class="randomizer-empty">
                    <span aria-hidden="true">${icon('profile')}</span>
                    <strong>No hay jugadores activos</strong>
                    <p>Añade o activa jugadores antes de preparar los equipos.</p>
                    <a class="btn btn--outline" href="/mister/jugadores">Gestionar plantilla</a>
                </div>`}
            </section>
            <aside class="card randomizer-setup">
                <header class="randomizer-panel-header">
                    <div>
                        <span class="randomizer-panel-kicker">Paso 2 · Configuración</span>
                        <h2>Prepara el reparto</h2>
                        <p>Elige cuántos equipos necesitas y el criterio de equilibrio.</p>
                    </div>
                </header>
                <section class="randomizer-setting">
                    <div class="randomizer-setting__heading">
                        <div><strong>Número de equipos</strong><small>Máximo seis equipos</small></div>
                        <output aria-live="polite">${setup.teams}</output>
                    </div>
                    <div class="randomizer-team-options" role="group" aria-label="Número de equipos">
                        ${teamChoices.map((teamCount) => `<button class="randomizer-team-option${setup.teams === teamCount ? ' randomizer-team-option--active' : ''}" type="button" data-action="randomizer-set-teams" data-teams="${teamCount}" aria-pressed="${setup.teams === teamCount}" ${teamCount > selected ? 'disabled' : ''}>${teamCount}</button>`).join('')}
                    </div>
                </section>
                <section class="randomizer-setting randomizer-balance-setting">
                    <div>
                        <strong>Equilibrar por rendimiento</strong>
                        <small>Usa la forma de los últimos cinco partidos además del cardio.</small>
                    </div>
                    <label class="switch"><input id="randomizer-balance" type="checkbox" aria-label="Equilibrar por rendimiento" ${randomizer.balanceStats ? 'checked' : ''}><span class="switch__track"></span></label>
                </section>
                <section class="randomizer-preview" aria-label="Resumen del reparto">
                    <div><span>Equipos</span><strong>${setup.teams}</strong></div>
                    <div><span>Jugadores</span><strong>${selected}</strong></div>
                    <div><span>Por equipo</span><strong>${setup.perTeamLabel}</strong></div>
                </section>
                <p class="randomizer-guidance${setup.canGenerate ? '' : ' randomizer-guidance--warning'}" aria-live="polite"><span aria-hidden="true">${setup.canGenerate ? '✓' : '!'}</span>${esc(setup.message)}</p>
                <button class="btn btn--wide randomizer-generate" type="button" data-action="randomizer-draw" ${setup.canGenerate ? '' : 'disabled'}>${icon('shuffle')} Generar ${setup.teams} equipos</button>
            </aside>
        </div>
    </section>`;
}

function drawTeams() {
    const randomizer = state.randomizer;
    const stats = new Map(calculateStats().map((item) => [item.player.id, item]));
    const selected = randomizer.players
        .filter((player) => randomizer.selected.has(player.id))
        .map((player) => {
            const item = stats.get(player.id);
            const statsScore = item?.isFormEligible ? item.formScore : 0;
            return { ...player, statsScore };
        });
    state.randomizerResult = generateBalancedTeams(selected, randomizer.teams, {
        balanceStats: randomizer.balanceStats,
    });
    navigate('/mister/equipos/resultado');
}

function renderRandomizerResult() {
    if (!isAdmin()) return restrictedPage();
    if (!state.randomizerResult) return `<section class="page">${pageHeader('Equipos listos', 'Revisa el reparto antes de preparar el próximo partido.')}<div class="card">${stateView('empty', 'No hay un sorteo activo', 'Vuelve al generador para elegir la convocatoria.', '<a class="btn" href="/mister/equipos">Volver al generador</a>')}</div></section>`;
    const teams = state.randomizerResult;
    const names = ['A', 'B', 'C', 'D', 'E', 'F'];
    const totalPlayers = teams.flat().length;
    const setup = resolveRandomizerSetup(totalPlayers, teams.length);
    return `<section class="page stack stack--wide manager-page manager-page--tools randomizer-result-page">
        ${pageHeader('Equipos listos', 'Revisa el reparto y decide si quieres usarlo para el próximo partido.', `<a class="btn btn--outline btn--compact" href="/mister/equipos">Editar convocatoria</a>`)}
        <section class="card randomizer-result-hero">
            <span class="randomizer-result-hero__icon" aria-hidden="true">${icon('shuffle')}</span>
            <div><span>REPARTO COMPLETADO</span><h2>${teams.length} equipos preparados</h2><p>${state.randomizer?.balanceStats ? 'Se ha tenido en cuenta el cardio y el rendimiento reciente.' : 'Se ha repartido el cardio entre los equipos de forma equilibrada.'}</p></div>
            <div class="randomizer-result-hero__stats"><strong>${totalPlayers}</strong><span>jugadores</span><small>${setup.perTeamLabel} por equipo</small></div>
        </section>
        <div class="randomizer-result-grid">${teams.map((team, index) => {
            const teamName = names[index];
            const cardioPlayers = team.filter((player) => player.has_cardio).length;
            const performance = team.reduce((sum, player) => sum + (player.statsScore || 0), 0);
            return `<section class="card generated-team generated-team--${teamName.toLowerCase()}">
                <header class="generated-team__header">
                    <i class="team-mark${index % 2 ? ' team-mark--gold' : ''}">${teamName}</i>
                    <div><span>EQUIPO</span><h2>Equipo ${teamName}</h2></div>
                    <strong>${team.length}<small>jugadores</small></strong>
                </header>
                <div class="generated-team__meta">
                    <span>⚡ ${cardioPlayers} con cardio</span>
                    ${state.randomizer?.balanceStats ? `<span>${formatSignedDecimal(performance)} puntos de forma</span>` : ''}
                </div>
                <div class="generated-team__players">${team.map((player, playerIndex) => `<div class="generated-team__player">
                    <span class="generated-team__position">${String(playerIndex + 1).padStart(2, '0')}</span>
                    ${avatar({ id: player.id, name: player.name })}
                    <strong>${esc(player.name)}</strong>
                    ${player.has_cardio ? '<span class="generated-team__cardio" title="Buen cardio">⚡</span>' : ''}
                </div>`).join('')}</div>
            </section>`;
        }).join('')}</div>
        <section class="card randomizer-result-footer">
            <div><span class="manager-form__icon" aria-hidden="true">${icon('info')}</span><p>${teams.length === 2 ? 'Puedes volver a sortear, guardar este reparto o crear directamente el acta.' : 'Puedes volver a sortear. Para crear un acta necesitas exactamente dos equipos.'}</p></div>
            <div class="manager-result-actions">
                <button class="btn btn--text" type="button" data-action="randomizer-redraw">${icon('shuffle')} Repetir sorteo</button>
                ${teams.length === 2 ? `<button class="btn btn--outline" type="button" data-action="randomizer-save">Guardar borrador</button><button class="btn" type="button" data-action="randomizer-create-record">${icon('plus')} Crear acta</button>` : ''}
            </div>
        </section>
    </section>`;
}

function saveRandomizerDraft() {
    if (state.randomizerResult?.length !== 2) return false;
    localStorage.setItem('hattitriki-match-teams-draft', JSON.stringify({
        teamA: state.randomizerResult[0].map((player) => player.id),
        teamB: state.randomizerResult[1].map((player) => player.id),
    }));
    return true;
}

function collectMatchBasics(form) {
    if (!state.matchDraft || !form) return;
    const data = new FormData(form);
    state.matchDraft.date = String(data.get('date') ?? state.matchDraft.date);
    state.matchDraft.scoreA = String(data.get('scoreA') ?? state.matchDraft.scoreA);
    state.matchDraft.scoreB = String(data.get('scoreB') ?? state.matchDraft.scoreB);
    state.matchDraft.penalties = data.get('penalties') === 'on';
    state.matchDraft.penaltyA = String(data.get('penaltyA') ?? state.matchDraft.penaltyA);
    state.matchDraft.penaltyB = String(data.get('penaltyB') ?? state.matchDraft.penaltyB);
    state.unsaved = true;
}

async function handleAuthSubmit(form) {
    const mode = form.dataset.mode;
    const data = new FormData(form);
    state.authBusy = true;
    state.authError = '';
    renderAuth();
    try {
        if (mode === 'login') {
            const { data: result, error } = await state.client.auth.signInWithPassword({
                email: String(data.get('email') || '').trim(),
                password: String(data.get('password') || ''),
            });
            if (error) throw error;
            state.session = result.session;
            await authorizeAndLoad();
            return;
        }
        if (mode === 'forgot' || mode === 'sent') {
            const email = mode === 'sent' ? state.recoverySentTo : String(data.get('email') || '').trim();
            const { error } = await state.client.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/` });
            if (error) throw error;
            state.recoverySentTo = email;
            state.authMode = 'sent';
        } else {
            const password = String(data.get('password') || '');
            const confirm = String(data.get('confirm') || '');
            if (password.length < 8) throw new Error('Usa al menos 8 caracteres.');
            if (password !== confirm) throw new Error('Las contraseñas no coinciden.');
            const { error } = await state.client.auth.updateUser({ password });
            if (error) throw error;
            state.authMode = 'login';
            history.replaceState({}, '', '/inicio');
            await authorizeAndLoad();
            return;
        }
    } catch (error) {
        state.authError = errorMessage(error, error?.message || 'No se ha podido completar la operación.');
    } finally {
        state.authBusy = false;
        render();
    }
}

root.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.target;
    if (form.id === 'auth-form') {
        await handleAuthSubmit(form);
    } else if (form.id === 'history-filter') {
        const data = new FormData(form);
        state.historyFilter.month = String(data.get('month') || state.historyFilter.month || '01');
        state.historyFilter.year = String(data.get('year') || state.historyFilter.year || new Date().getFullYear());
        state.historyFilter.from = String(data.get('from') || '');
        state.historyFilter.to = String(data.get('to') || '');
        state.historyControlsVisible = false;
        state.historyFiltersVisible = false;
        saveHistoryPreferences();
        render();
    } else if (form.id === 'player-form') {
        const data = new FormData(form);
        const id = form.dataset.id;
        const name = String(data.get('name') || '').trim();
        if (!name) return showSnackbar('El nombre es obligatorio.', true);
        try {
            await rpc(id ? 'update_active_player' : 'create_active_player', id
                ? { p_player_id: id, p_name: name, p_has_cardio: data.get('has_cardio') === 'on' }
                : { p_name: name, p_has_cardio: data.get('has_cardio') === 'on' });
            state.adminPlayers = null;
            state.unsaved = false;
            navigate('/mister/jugadores');
            showSnackbar(id ? 'Jugador actualizado' : 'Jugador añadido');
        } catch (error) {
            showSnackbar(errorMessage(error, 'No se ha podido guardar el jugador.'), true);
        }
    } else if (form.id === 'match-form') {
        collectMatchBasics(form);
        await saveMatchDraft(form.dataset.id);
    } else if (form.id === 'invitation-form') {
        const data = new FormData(form);
        const playerId = String(data.get('player_id') || '');
        const email = String(data.get('email') || '').trim();
        if (!playerId || !email) return showSnackbar('El jugador y el correo son obligatorios.', true);
        try {
            const { error } = await state.client.functions.invoke('send-league-invitation', {
                body: { playerId, email: email.toLowerCase() },
            });
            if (error) throw error;
            const playerNameValue = state.invitablePlayers.find((player) => player.id === playerId)?.name || 'El jugador';
            state.invitablePlayers = state.invitablePlayers.filter((player) => player.id !== playerId);
            state.invitationSuccess = { email, playerName: playerNameValue };
            state.unsaved = false;
            showSnackbar(`Invitación enviada a ${email}`);
        } catch (error) {
            showSnackbar(errorMessage(error, 'No se ha podido enviar la invitación.'), true);
        }
    } else if (form.id === 'manage-players-filter') {
        const data = new FormData(form);
        state.managePlayersFilter = { search: String(data.get('search') || ''), status: String(data.get('status') || 'all'), order: String(data.get('order') || 'az') };
        render();
    } else if (form.id === 'manage-matches-filter') {
        const data = new FormData(form);
        state.manageMatchesFilter = { search: String(data.get('search') || ''), type: String(data.get('type') || 'all'), order: String(data.get('order') || 'newest') };
        render();
    }
});

root.addEventListener('click', async (event) => {
    const internalLink = event.target.closest('a[href^="/"]');
    if (
        internalLink
        && !internalLink.hasAttribute('download')
        && internalLink.target !== '_blank'
        && event.button === 0
        && !event.metaKey
        && !event.ctrlKey
        && !event.shiftKey
        && !event.altKey
    ) {
        const targetPath = new URL(internalLink.href, location.origin).pathname;
        event.preventDefault();
        if (state.unsaved && targetPath !== location.pathname) {
            confirmDiscard(() => navigate(targetPath));
            return;
        }
        navigate(targetPath);
        return;
    }

    const target = event.target.closest('[data-action]');
    if (!target) {
        if (state.menuOpen && !event.target.closest('.account-menu')) {
            await closeAccountMenu();
        }
        return;
    }
    const action = target.dataset.action;
    if (action === 'toggle-account') {
        if (state.menuOpen) {
            await closeAccountMenu();
        } else {
            state.menuOpen = true;
            state.menuClosing = false;
            render();
        }
    } else if (action === 'back') {
        if (state.unsaved) confirmDiscard(() => history.back());
        else history.back();
    } else if (action === 'refresh') {
        await loadApplicationData(true);
    } else if (action === 'logout') {
        try {
            await state.client.auth.signOut();
        } finally {
            resetAvatarState();
            state.session = null;
            state.access = null;
            state.snapshot = { players: [], matches: [] };
            state.seasons = [];
            state.selectedSeasonId = null;
            state.mvpVotes = [];
            state.mvpVotingDisabledMatchIds = new Set();
            state.mvpVotingMatchId = null;
            state.authMode = 'login';
            state.menuOpen = false;
            state.menuClosing = false;
            history.replaceState({}, '', location.pathname);
            renderAuth();
        }
    } else if (action === 'auth-mode') {
        state.authMode = target.dataset.mode;
        state.authError = '';
        authMotionPending = true;
        renderAuth();
    } else if (action === 'discard-callback') {
        await state.client.auth.signOut({ scope: 'local' }).catch(() => {});
        resetAvatarState();
        state.session = null;
        state.authMode = 'login';
        history.replaceState({}, '', location.pathname);
        renderAuth();
    } else if (action === 'toggle-password') {
        const input = target.parentElement.querySelector('input');
        input.type = input.type === 'password' ? 'text' : 'password';
        target.setAttribute('aria-label', input.type === 'password' ? 'Mostrar contraseña' : 'Ocultar contraseña');
    } else if (action === 'open-ranking') {
        if (state.suppressStatClick) {
            state.suppressStatClick = false;
            return;
        }
        state.rankingCategory = target.dataset.category;
        saveRankingPreferences();
        navigate('/rankings');
    } else if (action === 'ranking-category') {
        state.rankingCategory = target.dataset.category;
        saveRankingPreferences();
        rankingMotionPending = true;
        render();
    } else if (action === 'ranking-view') {
        state.rankingView = target.dataset.view || (state.rankingView === 'compact' ? 'detailed' : 'compact');
        saveRankingPreferences();
        rankingMotionPending = true;
        render();
    } else if (action === 'toggle-ranking-filters') {
        state.rankingFiltersVisible = !state.rankingFiltersVisible;
        render();
    } else if (action === 'ranking-info') {
        const definition = RANKINGS[state.rankingCategory] || RANKINGS['top-scorer'];
        state.dialog = {
            variant: 'ranking-info',
            title: definition.label,
            symbol: RANKING_SYMBOLS[state.rankingCategory] || '⚽',
            message: definition.description,
            confirmLabel: 'Entendido',
            singleAction: true,
            onConfirm: () => {},
        };
        render();
        queueMicrotask(() => document.querySelector('.ranking-dialog__close')?.focus());
    } else if (action === 'toggle-mvp-vote') {
        if (state.mvpVotingDisabledMatchIds.has(target.dataset.matchId)) return;
        state.mvpVotingMatchId = state.mvpVotingMatchId === target.dataset.matchId
            ? null
            : target.dataset.matchId;
        render();
    } else if (action === 'cast-mvp-vote') {
        if (state.mvpVotingDisabledMatchIds.has(target.dataset.matchId)) return;
        if (target.dataset.playerId === state.currentPlayerId) return;
        state.mvpBusy = true;
        render();
        try {
            await rpc('cast_match_mvp_vote', {
                p_match_id: target.dataset.matchId,
                p_nominee_player_id: target.dataset.playerId,
            });
            await refreshMvpVotes();
            state.mvpVotingMatchId = null;
            showSnackbar('Voto MVP guardado');
        } catch (error) {
            showSnackbar(errorMessage(error, 'No se ha podido guardar tu voto MVP.'), true);
        } finally {
            state.mvpBusy = false;
            render();
        }
    } else if (action === 'toggle-metric-explanations') {
        state.profileExplanations = !state.profileExplanations;
        render();
    } else if (action === 'view-avatar') {
        state.dialog = {
            title: 'FOTO DE PERFIL',
            content: `<img class="enlarged-avatar" src="${esc(target.dataset.url)}" alt="Foto de perfil ampliada de ${esc(target.dataset.name)}" data-user-avatar data-avatar-player-id="${esc(target.dataset.playerId)}" data-avatar-fallback="${esc(initials(target.dataset.name))}"><p>Foto de perfil de ${esc(target.dataset.name)}</p>`,
            confirmLabel: 'Cerrar',
            singleAction: true,
            onConfirm: () => {},
        };
        render();
    } else if (action === 'history-mode') {
        state.historyFilter.mode = target.dataset.mode;
        if (target.dataset.mode === 'month') {
            state.historyFilter.month ||= String(new Date().getMonth() + 1).padStart(2, '0');
            state.historyFilter.year ||= String(new Date().getFullYear());
        } else if (target.dataset.mode === 'year') {
            state.historyFilter.year ||= String(new Date().getFullYear());
        }
        saveHistoryPreferences();
        render();
    } else if (action === 'history-toggle-filters') {
        state.historyFiltersVisible = !state.historyFiltersVisible;
        render();
    } else if (action === 'history-toggle-controls') {
        state.historyControlsVisible = !state.historyControlsVisible;
        if (!state.historyControlsVisible) state.historyFiltersVisible = false;
        render();
    } else if (action === 'history-clear') {
        state.historyFilter = { mode: 'all', month: '', year: '', from: '', to: '' };
        state.historyControlsVisible = false;
        state.historyFiltersVisible = false;
        saveHistoryPreferences();
        render();
    } else if (action === 'reload-admin-players') {
        await loadAdminPlayers();
    } else if (action === 'reload-admin-matches') {
        await loadAdminMatches();
    } else if (action === 'reload-invitable') {
        await loadInvitablePlayers();
    } else if (action === 'invite-another') {
        state.invitationSuccess = null;
        state.unsaved = false;
        render();
    } else if (action === 'toggle-player-active') {
        if (target.dataset.active === 'true') {
            const player = Array.isArray(state.adminPlayers) ? state.adminPlayers.find((item) => item.id === target.dataset.id) : null;
            state.dialog = {
                title: `Desactivar a ${player?.name || 'este jugador'}`,
                message: `${player?.name || 'El jugador'} dejará de aparecer en nuevas convocatorias, pero conservará todo su historial.`,
                confirmLabel: 'Desactivar jugador',
                danger: true,
                onConfirm: async () => {
                    await rpc('set_player_active', { p_player_id: target.dataset.id, p_is_active: false });
                    await loadAdminPlayers();
                    showSnackbar('Jugador desactivado');
                },
            };
            render();
            return;
        }
        try {
            await rpc('set_player_active', { p_player_id: target.dataset.id, p_is_active: true });
            await loadAdminPlayers();
            showSnackbar('Jugador activado');
        } catch (error) {
            showSnackbar(errorMessage(error, 'No se ha podido cambiar el estado del jugador.'), true);
        }
    } else if (action === 'delete-player') {
        state.dialog = {
            title: 'Borrar jugador',
            message: `¿Quieres borrar a ${target.dataset.name}? Esta acción no se puede deshacer.`,
            confirmLabel: 'Borrar',
            danger: true,
            onConfirm: async () => {
                await rpc('delete_player', { p_player_id: target.dataset.id });
                state.adminPlayers = null;
                await loadAdminPlayers();
                showSnackbar('Jugador borrado');
            },
        };
        render();
    } else if (action === 'delete-match') {
        state.dialog = {
            title: 'Borrar partido',
            message: `¿Quieres borrar el acta del ${target.dataset.date}? También se borrarán sus alineaciones y goles.`,
            confirmLabel: 'Borrar',
            danger: true,
            onConfirm: async () => {
                await rpc('delete_friendly_match', { p_match_id: target.dataset.id });
                state.adminMatches = null;
                await loadApplicationData();
                await loadAdminMatches();
                showSnackbar('Partido borrado');
            },
        };
        render();
    } else if (action === 'dialog-cancel') {
        await closeDialog();
    } else if (action === 'dialog-confirm') {
        const callback = state.dialog?.onConfirm;
        await closeDialog();
        try {
            await callback?.();
        } catch (error) {
            showSnackbar(errorMessage(error), true);
        }
    } else if (action === 'retry-match-draft') {
        await prepareMatchDraft(state.matchDraft?.id || '');
    } else if (action === 'discard-team-draft') {
        localStorage.removeItem('hattitriki-match-teams-draft');
        state.matchDraft.assignments = {};
        state.matchDraft.goalkeepers = {};
        state.matchDraft.draftLoaded = false;
        state.unsaved = true;
        render();
    } else if (action === 'match-step') {
        collectMatchBasics(document.querySelector('#match-form'));
        const nextStep = Number(target.dataset.step);
        const requirement = nextStep === 2 && !hasValidMatchBasics(state.matchDraft)
            ? matchStepRequirement(state.matchDraft, 1)
            : nextStep === 3 && !hasValidMatchTeams(state.matchDraft)
                ? matchStepRequirement(state.matchDraft, 2)
                : '';
        if (requirement) {
            showSnackbar(requirement, true);
            return;
        }
        state.matchStep = nextStep;
        matchStepMotionPending = true;
        render();
    } else if (action === 'match-next') {
        collectMatchBasics(document.querySelector('#match-form'));
        const requirement = state.matchStep === 1 && !hasValidMatchBasics(state.matchDraft)
            ? matchStepRequirement(state.matchDraft, 1)
            : state.matchStep === 2 && !hasValidMatchTeams(state.matchDraft)
                ? matchStepRequirement(state.matchDraft, 2)
                : '';
        if (requirement) {
            showSnackbar(requirement, true);
            return;
        }
        state.matchStep = Math.min(3, state.matchStep + 1);
        matchStepMotionPending = true;
        render();
    } else if (action === 'match-previous') {
        state.matchStep = Math.max(1, state.matchStep - 1);
        matchStepMotionPending = true;
        render();
    } else if (action === 'add-goal') {
        state.matchDraft.goals.push({ playerId: '', team: 'A', count: 1, ownGoal: false });
        state.unsaved = true;
        render();
    } else if (action === 'remove-goal') {
        state.matchDraft.goals.splice(Number(target.dataset.index), 1);
        if (!state.matchDraft.goals.length) state.matchDraft.goals.push({ playerId: '', team: 'A', count: 1, ownGoal: false });
        state.unsaved = true;
        render();
    } else if (action === 'retry-randomizer') {
        await prepareRandomizer();
    } else if (action === 'randomizer-select-all') {
        state.randomizer.selected = new Set(state.randomizer.players.map((player) => player.id));
        render();
    } else if (action === 'randomizer-select-none') {
        state.randomizer.selected = new Set();
        state.randomizer.teams = 2;
        render();
    } else if (action === 'randomizer-set-teams') {
        const teamCount = Number(target.dataset.teams);
        if (
            Number.isInteger(teamCount)
            && teamCount >= 2
            && teamCount <= Math.min(MAX_RANDOMIZER_TEAMS, state.randomizer.selected.size)
        ) {
            state.randomizer.teams = teamCount;
        }
        render();
    } else if (action === 'randomizer-draw') {
        drawTeams();
    } else if (action === 'randomizer-redraw') {
        drawTeams();
    } else if (action === 'randomizer-save') {
        saveRandomizerDraft();
        showSnackbar('Equipos guardados como borrador para el próximo partido.');
        render();
    } else if (action === 'randomizer-create-record') {
        saveRandomizerDraft();
        state.matchDraft = null;
        navigate('/mister/partidos/nuevo');
    }
});

root.addEventListener('change', async (event) => {
    const target = event.target;
    if (target.id === 'history-season-filter') {
        await selectSeason(Number(target.value));
    } else if (target.matches('[data-match-field="team"]')) {
        const playerId = target.dataset.player;
        const team = target.dataset.team;
        const teams = state.matchDraft.assignments[playerId] || [];
        if (target.checked && !teams.includes(team)) teams.push(team);
        if (!target.checked) {
            const index = teams.indexOf(team);
            if (index >= 0) teams.splice(index, 1);
            state.matchDraft.goalkeepers[`${playerId}:${team}`] = false;
        }
        state.matchDraft.assignments[playerId] = teams;
        state.unsaved = true;
        render();
    } else if (target.matches('[data-match-field="goalkeeper"]')) {
        state.matchDraft.goalkeepers[`${target.dataset.player}:${target.dataset.team}`] = target.checked;
        state.unsaved = true;
    } else if (target.matches('[data-goal-field]')) {
        const goal = state.matchDraft.goals[Number(target.dataset.index)];
        const field = target.dataset.goalField;
        goal[field] = target.type === 'checkbox' ? target.checked : field === 'count' ? Number(target.value) : target.value;
        state.unsaved = true;
        if (field === 'team' || field === 'ownGoal') {
            goal.playerId = '';
            render();
        }
    } else if (target.matches('[data-randomizer-player]')) {
        if (target.checked) state.randomizer.selected.add(target.dataset.randomizerPlayer);
        else state.randomizer.selected.delete(target.dataset.randomizerPlayer);
        state.selectionMotion = target.checked
            ? { type: 'randomizer', id: target.dataset.randomizerPlayer }
            : null;
        state.randomizer.teams = Math.min(
            state.randomizer.teams,
            Math.max(2, Math.min(MAX_RANDOMIZER_TEAMS, state.randomizer.selected.size)),
        );
        render();
    } else if (target.id === 'randomizer-balance') {
        state.randomizer.balanceStats = target.checked;
    } else if (target.id === 'avatar-upload' && target.files?.[0]) {
        await uploadAvatar(target.files[0]);
    } else if (target.closest('#match-form')) {
        collectMatchBasics(target.form);
        if (target.name === 'penalties') render();
    } else if (target.closest('#player-form, #invitation-form')) {
        state.unsaved = true;
    }
});

root.addEventListener('input', (event) => {
    if (event.target.closest('#player-form, #invitation-form')) {
        state.unsaved = true;
    }
    const form = event.target.closest('#auth-form[data-mode="login"], #auth-form[data-mode="forgot"]');
    if (!form) return;
    const email = form.querySelector('[name="email"]')?.value.trim() || '';
    const password = form.querySelector('[name="password"]')?.value || '';
    const submit = form.querySelector('[type="submit"]');
    if (submit) submit.disabled = form.dataset.mode === 'forgot' ? !email : !email || !password;
});

function pullRefreshElements(scroll = pullRefreshGesture?.scroll) {
    return {
        scroll,
        indicator: scroll?.querySelector('.pull-refresh-indicator'),
        label: scroll?.querySelector('.pull-refresh-indicator__label'),
    };
}

function resetPullRefreshVisual(scroll, immediate = false) {
    if (!scroll) return;
    scroll.classList.toggle('main-scroll--pull-reset-immediate', immediate);
    scroll.classList.remove('main-scroll--pulling', 'main-scroll--pull-ready', 'main-scroll--refreshing');
    scroll.style.setProperty('--pull-distance', '0px');
    scroll.style.setProperty('--pull-progress', '0');
    const label = scroll.querySelector('.pull-refresh-indicator__label');
    if (label) label.textContent = 'Desliza para actualizar';
    if (immediate) {
        requestAnimationFrame(() => scroll.classList.remove('main-scroll--pull-reset-immediate'));
    }
}

function updatePullRefreshVisual(gesture) {
    const { scroll, label } = pullRefreshElements(gesture.scroll);
    if (!scroll) return;
    scroll.classList.add('main-scroll--pulling');
    scroll.classList.toggle('main-scroll--pull-ready', gesture.ready);
    scroll.style.setProperty('--pull-distance', `${gesture.distance}px`);
    scroll.style.setProperty('--pull-progress', String(gesture.progress));
    if (label) label.textContent = gesture.ready ? 'Suelta para actualizar' : 'Desliza para actualizar';
}

async function refreshCurrentScreen() {
    const route = currentRoute();

    if (route === '/mister/partidos') {
        state.adminMatches = await rpc('get_admin_friendly_matches');
        render();
        return;
    }
    if (route === '/mister/jugadores') {
        state.adminPlayers = await rpc('get_admin_players');
        render();
        return;
    }
    if (route === '/mister/invitacion') {
        state.invitablePlayers = await rpc('get_invitable_players');
        render();
        return;
    }
    if (route === '/mister/equipos') {
        await refreshRandomizerPlayers();
        render();
        return;
    }
    if (route.startsWith('/mister/partidos/')) {
        const matchId = route === '/mister/partidos/nuevo' ? '' : fromHex(route.split('/').pop());
        await prepareMatchDraft(matchId);
        return;
    }
    if (route.startsWith('/mister/jugadores/')) {
        state.adminPlayers = await rpc('get_admin_players');
        render();
        return;
    }

    await loadApplicationData();
}

async function performPullRefresh(scroll) {
    if (pullRefreshBusy) return;
    pullRefreshBusy = true;
    const { label } = pullRefreshElements(scroll);
    scroll?.classList.remove('main-scroll--pulling', 'main-scroll--pull-ready');
    scroll?.classList.add('main-scroll--refreshing');
    scroll?.style.setProperty('--pull-distance', '54px');
    if (label) label.textContent = 'Actualizando datos';

    try {
        await refreshCurrentScreen();
        showSnackbar('Datos actualizados');
    } catch (error) {
        showSnackbar(errorMessage(error, 'No se ha podido actualizar la pantalla.'), true);
    } finally {
        pullRefreshBusy = false;
        pullRefreshGesture = null;
        resetPullRefreshVisual(document.querySelector('.main-scroll'));
    }
}

root.addEventListener('touchstart', (event) => {
    const scroll = event.target.closest('.main-scroll');
    const touch = event.touches[0];
    const blockedTarget = Boolean(event.target.closest(
        'input, textarea, select, [contenteditable="true"], [data-stat-key], .dialog-backdrop',
    ));

    if (!scroll || !touch || !canStartPullRefresh({
        scrollTop: scroll.scrollTop,
        touchCount: event.touches.length,
        refreshing: pullRefreshBusy,
        unsaved: state.unsaved,
        dialogOpen: Boolean(state.dialog),
        blockedTarget,
    })) {
        pullRefreshGesture = null;
        return;
    }

    pullRefreshGesture = {
        scroll,
        startX: touch.clientX,
        startY: touch.clientY,
        distance: 0,
        ready: false,
    };
}, { passive: true });

root.addEventListener('touchmove', (event) => {
    if (!pullRefreshGesture || state.statReorder?.active || event.touches.length !== 1) return;
    const touch = event.touches[0];
    const resolved = resolvePullGesture(
        pullRefreshGesture.startX,
        pullRefreshGesture.startY,
        touch.clientX,
        touch.clientY,
        PULL_REFRESH_THRESHOLD,
    );
    if (!resolved.active) return;

    event.preventDefault();
    Object.assign(pullRefreshGesture, resolved);
    updatePullRefreshVisual(pullRefreshGesture);
}, { passive: false });

root.addEventListener('touchend', () => {
    const gesture = pullRefreshGesture;
    if (!gesture) return;
    pullRefreshGesture = null;
    if (gesture.ready) {
        void performPullRefresh(gesture.scroll);
    } else {
        resetPullRefreshVisual(gesture.scroll);
    }
}, { passive: true });

root.addEventListener('touchcancel', () => {
    resetPullRefreshVisual(pullRefreshGesture?.scroll, true);
    pullRefreshGesture = null;
}, { passive: true });

const STAT_LONG_PRESS_DELAY = 420;
const STAT_PRESS_MOVE_TOLERANCE = 9;

function announceStatReorder(message) {
    const status = document.querySelector('#stat-reorder-status');
    if (status) status.textContent = message;
}

function clearStatReorderClasses(reorder = state.statReorder) {
    reorder?.flipAnimations?.forEach((animation) => animation.cancel());
    reorder?.grid?.classList.remove('stats-grid--reordering');
    reorder?.card?.classList.remove('stat-card--dragging');
    reorder?.card?.style.removeProperty('--drag-x');
    reorder?.card?.style.removeProperty('--drag-y');
}

function cancelPendingStatReorder() {
    if (!state.statReorder || state.statReorder.active) return;
    window.clearTimeout(state.statReorder.timer);
    state.statReorder = null;
}

function activateStatReorder(reorder) {
    if (state.statReorder !== reorder) return;
    reorder.active = true;
    reorder.originalVisibleOrder = [...reorder.grid.querySelectorAll('[data-stat-key]')]
        .map((card) => card.dataset.statKey);
    reorder.visibleOrder = [...reorder.originalVisibleOrder];
    reorder.slotRects = [...reorder.grid.querySelectorAll('[data-stat-key]')]
        .map((card) => card.getBoundingClientRect());
    state.suppressStatClick = true;
    reorder.card.classList.add('stat-card--dragging');
    reorder.grid.classList.add('stats-grid--reordering');
    navigator.vibrate?.(45);
    announceStatReorder('Modo reordenación activado. Arrastra la tarjeta y suelta para colocarla.');
}

function previewStatReorder(reorder, desiredIndex) {
    reorder.flipAnimations.forEach((animation) => animation.cancel());
    reorder.flipAnimations = [];
    const cards = [...reorder.grid.querySelectorAll('[data-stat-key]')];
    const currentIndex = cards.indexOf(reorder.card);
    if (currentIndex === desiredIndex || desiredIndex < 0 || desiredIndex >= cards.length) return;

    const beforeRects = new Map(cards.map((card) => [card, card.getBoundingClientRect()]));
    const reference = cards[desiredIndex];
    if (desiredIndex > currentIndex) reference.after(reorder.card);
    else reference.before(reorder.card);

    const draggedBefore = beforeRects.get(reorder.card);
    const draggedAfter = reorder.card.getBoundingClientRect();
    reorder.offsetX += draggedBefore.left - draggedAfter.left;
    reorder.offsetY += draggedBefore.top - draggedAfter.top;
    reorder.card.style.setProperty('--drag-x', `${reorder.dragX + reorder.offsetX}px`);
    reorder.card.style.setProperty('--drag-y', `${reorder.dragY + reorder.offsetY}px`);

    if (!prefersReducedMotion()) {
        [...reorder.grid.querySelectorAll('[data-stat-key]')].forEach((card) => {
            if (card === reorder.card) return;
            const before = beforeRects.get(card);
            const after = card.getBoundingClientRect();
            const x = before.left - after.left;
            const y = before.top - after.top;
            if (!x && !y) return;
            const animation = card.animate?.(
                [
                    { transform: `translate3d(${x}px, ${y}px, 0)` },
                    { transform: 'translate3d(0, 0, 0)' },
                ],
                { duration: MOTION_BASE_DURATION_MS, easing: 'cubic-bezier(.2, .8, .2, 1)' },
            );
            if (animation) reorder.flipAnimations.push(animation);
        });
    }

    reorder.visibleOrder = [...reorder.grid.querySelectorAll('[data-stat-key]')]
        .map((card) => card.dataset.statKey);
}

function finishStatReorder(cancelled = false) {
    const reorder = state.statReorder;
    if (!reorder) return;
    window.clearTimeout(reorder.timer);
    const scrollPosition = {
        top: reorder.scrollContainer?.scrollTop || 0,
        left: reorder.scrollContainer?.scrollLeft || 0,
    };
    clearStatReorderClasses(reorder);
    state.statReorder = null;

    if (!reorder.active) return;

    const orderChanged = reorder.visibleOrder.some((key, index) => key !== reorder.originalVisibleOrder[index]);
    if (cancelled && orderChanged) {
        render();
        queueMicrotask(() => {
            restoreStatCardScroll(document.querySelector('#main-content'), scrollPosition);
            announceStatReorder('Reordenación cancelada.');
        });
    } else if (orderChanged) {
        let visibleIndex = 0;
        const visibleKeys = new Set(reorder.visibleOrder);
        const order = state.homeOrder.map((key) => (
            visibleKeys.has(key) ? reorder.visibleOrder[visibleIndex++] : key
        ));
        state.homeOrder = order;
        localStorage.setItem('hattitriki-home-order', JSON.stringify(order));
        render();
        queueMicrotask(() => {
            restoreStatCardScroll(document.querySelector('#main-content'), scrollPosition);
            announceStatReorder('Tarjeta recolocada.');
        });
    } else {
        announceStatReorder(cancelled ? 'Reordenación cancelada.' : 'La tarjeta mantiene su posición.');
    }

    window.setTimeout(() => {
        state.suppressStatClick = false;
    }, 0);
}

root.addEventListener('pointerdown', (event) => {
    const card = event.target.closest('[data-stat-key]');
    if (!card || event.button !== 0 || state.statReorder) return;
    const grid = card.closest('.stats-grid');
    if (!grid) return;
    const reorder = {
        key: card.dataset.statKey,
        pointerId: event.pointerId,
        originX: event.clientX,
        originY: event.clientY,
        dragX: 0,
        dragY: 0,
        offsetX: 0,
        offsetY: 0,
        flipAnimations: [],
        active: false,
        card,
        grid,
        scrollContainer: card.closest('.main-scroll'),
        timer: 0,
    };
    // The card is moved between grid slots while dragging. Pointer capture on
    // that movable node is released by Chromium as soon as the DOM move occurs,
    // which fires lostpointercapture and cancels the reorder. Keep capture on
    // the stable grid instead.
    captureStatCardPointer(card, event.pointerId);
    reorder.timer = window.setTimeout(() => activateStatReorder(reorder), STAT_LONG_PRESS_DELAY);
    state.statReorder = reorder;
});

root.addEventListener('contextmenu', (event) => {
    if (event.target.closest('[data-stat-key]')) event.preventDefault();
});

root.addEventListener('touchmove', (event) => {
    // A normal touch must remain available for page scrolling. Once the long
    // press has activated reorder mode, prevent the same gesture from moving
    // the page so pointermove can place the card instead.
    if (shouldBlockStatCardScroll(state.statReorder)) event.preventDefault();
}, { passive: false });

root.addEventListener('pointermove', (event) => {
    const reorder = state.statReorder;
    if (!reorder || reorder.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - reorder.originX;
    const deltaY = event.clientY - reorder.originY;

    if (!reorder.active) {
        if (movedBeyondPressTolerance(
            reorder.originX,
            reorder.originY,
            event.clientX,
            event.clientY,
            STAT_PRESS_MOVE_TOLERANCE,
        )) {
            cancelPendingStatReorder();
        }
        return;
    }

    event.preventDefault();
    reorder.dragX = deltaX;
    reorder.dragY = deltaY;
    reorder.card.style.setProperty('--drag-x', `${deltaX + reorder.offsetX}px`);
    reorder.card.style.setProperty('--drag-y', `${deltaY + reorder.offsetY}px`);

    const desiredIndex = reorder.slotRects.reduce((closestIndex, rect, index) => {
        const closestRect = reorder.slotRects[closestIndex];
        const distance = Math.hypot(
            event.clientX - (rect.left + rect.width / 2),
            event.clientY - (rect.top + rect.height / 2),
        );
        const closestDistance = Math.hypot(
            event.clientX - (closestRect.left + closestRect.width / 2),
            event.clientY - (closestRect.top + closestRect.height / 2),
        );
        return distance < closestDistance ? index : closestIndex;
    }, 0);
    previewStatReorder(reorder, desiredIndex);
});

root.addEventListener('pointerup', (event) => {
    if (state.statReorder?.pointerId === event.pointerId) finishStatReorder();
});

root.addEventListener('pointercancel', (event) => {
    if (state.statReorder?.pointerId === event.pointerId) finishStatReorder(true);
});

root.addEventListener('lostpointercapture', (event) => {
    if (state.statReorder?.pointerId === event.pointerId) finishStatReorder(true);
});

root.addEventListener('error', (event) => {
    const image = event.target;
    if (!(image instanceof HTMLImageElement) || !image.matches('[data-user-avatar]')) return;

    const playerId = image.dataset.avatarPlayerId;
    const renderedUrl = image.getAttribute('src');
    const fallback = image.dataset.avatarFallback || '?';

    if (playerId && state.avatars[playerId] === renderedUrl) {
        delete state.avatars[playerId];
    }

    const avatarRoot = image.closest('.avatar');
    if (avatarRoot) {
        avatarRoot.classList.add('avatar--fallback');
        avatarRoot.textContent = fallback;
    } else if (image.classList.contains('enlarged-avatar')) {
        const replacement = document.createElement('span');
        replacement.className = 'enlarged-avatar enlarged-avatar--fallback';
        replacement.textContent = fallback;
        replacement.setAttribute('aria-label', image.alt);
        image.replaceWith(replacement);
    } else {
        image.remove();
    }

    const now = Date.now();
    if (now - lastAvatarFailureRefreshAt >= AVATAR_FAILURE_REFRESH_COOLDOWN_MS) {
        lastAvatarFailureRefreshAt = now;
        void refreshAvatarUrls({ force: true, renderAfter: true });
    }
}, true);

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        void refreshAvatarUrls({ renderAfter: true });
    }
});

window.addEventListener('online', () => {
    void refreshAvatarUrls({ force: true, renderAfter: true });
});

window.addEventListener('pageshow', () => {
    void refreshAvatarUrls({ renderAfter: true });
});

async function uploadAvatar(file) {
    if (!['image/jpeg', 'image/webp'].includes(file.type)) {
        showSnackbar('Usa una imagen JPEG o WebP.', true);
        return;
    }
    if (file.size > 2_500_000) {
        showSnackbar('La imagen no puede superar 2,5 MB.', true);
        return;
    }
    let prepared;
    try {
        prepared = await prepareAvatar(file);
    } catch {
        showSnackbar('No se ha podido preparar la foto elegida.', true);
        return;
    }
    if (prepared.size > 2_500_000) {
        showSnackbar('La foto optimizada supera el límite de 2,5 MB. Elige otra foto más sencilla.', true);
        return;
    }
    const userId = state.session?.user?.id;
    if (!userId) return;
    const extension = prepared.type === 'image/jpeg' ? 'jpg' : 'webp';
    const path = `${userId}/${userId}.${extension}`;
    try {
        const { error: uploadError } = await state.client.storage.from('avatars').upload(path, prepared, {
            upsert: true,
            contentType: prepared.type,
        });
        if (uploadError) throw uploadError;
        await rpc('set_own_avatar', { p_avatar_path: path });
        await loadApplicationData();
        showSnackbar('Foto de perfil actualizada');
    } catch (error) {
        showSnackbar(errorMessage(error, 'No se ha podido actualizar la foto de perfil.'), true);
    }
}

async function prepareAvatar(file) {
    const bitmap = await createImageBitmap(file);
    const sourceSize = Math.min(bitmap.width, bitmap.height);
    const sourceX = Math.floor((bitmap.width - sourceSize) / 2);
    const sourceY = Math.floor((bitmap.height - sourceSize) / 2);
    const targetSize = Math.min(640, sourceSize);
    const canvas = document.createElement('canvas');
    canvas.width = targetSize;
    canvas.height = targetSize;
    const context = canvas.getContext('2d', { alpha: false });
    context.drawImage(bitmap, sourceX, sourceY, sourceSize, sourceSize, 0, 0, targetSize, targetSize);
    bitmap.close();

    const toBlob = (type, quality) => new Promise((resolve, reject) => {
        canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Avatar encoding failed')), type, quality);
    });
    let blob = await toBlob('image/webp', .86).catch(() => toBlob('image/jpeg', .86));
    if (blob.size > 2_500_000) blob = await toBlob(blob.type, .7);
    return blob;
}

window.addEventListener('popstate', () => {
    if (state.unsaved && state.lastPath && location.pathname !== state.lastPath) {
        const requestedPath = location.pathname;
        history.replaceState({}, '', state.lastPath);
        confirmDiscard(() => navigate(requestedPath));
        return;
    }
    state.lastPath = location.pathname;
    state.menuOpen = false;
    render();
    queueMicrotask(() => document.querySelector('#main-content')?.focus({ preventScroll: true }));
});

window.addEventListener('beforeunload', (event) => {
    if (state.unsaved) {
        event.preventDefault();
        event.returnValue = '';
    }
});

initialize().catch((error) => {
    state.authError = errorMessage(error, 'No se ha podido iniciar Hattitriki.');
    renderAuth();
});
