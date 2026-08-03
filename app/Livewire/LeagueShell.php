<?php

declare(strict_types=1);

namespace App\Livewire;

use App\Exceptions\SupabaseApiException;
use App\Services\LeagueStatistics;
use App\Services\Supabase\SupabaseGateway;
use App\Services\Supabase\SupabaseSession;
use Illuminate\Contracts\View\View;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Livewire\Attributes\Locked;
use Livewire\Component;
use Livewire\Features\SupportFileUploads\WithFileUploads;
use Throwable;

final class LeagueShell extends Component
{
    use WithFileUploads;

    private const RANKING_CATEGORIES = [
        'top-scorer',
        'goals-per-match',
        'zamora',
        'goals-conceded-per-match',
        'most-played',
        'most-wins',
        'player-on-form',
        'people-favourite',
    ];

    #[Locked]
    public string $routeName = 'home';

    #[Locked]
    public string $routePath = '/inicio';

    #[Locked]
    public ?string $resourceId = null;

    #[Locked]
    public string $role = 'member';

    #[Locked]
    public string $email = '';

    #[Locked]
    public ?string $currentPlayerId = null;

    #[Locked]
    public array $players = [];

    #[Locked]
    public array $matches = [];

    #[Locked]
    public array $seasons = [];

    #[Locked]
    public array $mvpVotes = [];

    #[Locked]
    public array $mvpDisabledMatchIds = [];

    #[Locked]
    public array $avatars = [];

    #[Locked]
    public array $adminPlayers = [];

    #[Locked]
    public array $adminMatches = [];

    #[Locked]
    public array $activePlayers = [];

    #[Locked]
    public array $invitablePlayers = [];

    #[Locked]
    public array $generatedTeams = [];

    public ?int $selectedSeasonId = null;

    public string $rankingCategory = 'top-scorer';

    public string $historySearch = '';

    public string $historyFrom = '';

    public string $historyTo = '';

    public string $playerSearch = '';

    public string $playerStatus = 'all';

    public string $matchSearch = '';

    public string $matchType = 'all';

    public string $playerName = '';

    public bool $playerHasCardio = false;

    #[Locked]
    public ?string $editingPlayerId = null;

    public string $matchDate = '';

    public int $scoreA = 0;

    public int $scoreB = 0;

    public bool $hasPenalties = false;

    public ?int $penaltyA = null;

    public ?int $penaltyB = null;

    public array $teamA = [];

    public array $teamB = [];

    public array $goalkeepersA = [];

    public array $goalkeepersB = [];

    public array $goals = [];

    #[Locked]
    public ?string $editingMatchId = null;

    public string $invitationPlayerId = '';

    public string $invitationEmail = '';

    #[Locked]
    public ?array $invitationSuccess = null;

    public array $selectedPlayerIds = [];

    public int $teamCount = 2;

    public string $balanceMode = 'streak';

    public $avatar = null;

    public string $statusMessage = '';

    public string $loadError = '';

    public function mount(
        string $routeName,
        string $routePath,
        ?string $resourceId,
        SupabaseSession $session,
        SupabaseGateway $gateway,
        LeagueStatistics $statistics,
    ): void {
        $this->routeName = $routeName;
        $this->routePath = $routePath;
        $this->resourceId = $resourceId;

        if (! $session->check()) {
            $this->redirect('/', navigate: true);

            return;
        }

        try {
            if (! $this->loadAccess($gateway, $session)) {
                return;
            }
            $this->loadCore($gateway, $statistics);
            $this->loadRouteData($gateway, $statistics);
        } catch (Throwable $exception) {
            report($exception);
            $this->loadError = 'No se han podido cargar los datos de la liga. Inténtalo de nuevo.';
        }
    }

    public function selectSeason(int $seasonId, SupabaseGateway $gateway, LeagueStatistics $statistics): void
    {
        if (! in_array($seasonId, array_column($this->seasons, 'id'), true)) {
            return;
        }

        $this->selectedSeasonId = $seasonId;
        session()->put('hattitriki.selected_season_id', $seasonId);
        $rows = $gateway->rpc('get_public_friendly_matches', ['p_season_id' => $seasonId]);
        $this->matches = $statistics->normalizeMatches(is_array($rows) ? $rows : []);
    }

    public function setRankingCategory(string $category): void
    {
        if (in_array($category, self::RANKING_CATEGORIES, true)) {
            $this->rankingCategory = $category;
        }
    }

    public function refreshLeague(SupabaseGateway $gateway, LeagueStatistics $statistics): void
    {
        $this->statusMessage = '';
        $this->loadCore($gateway, $statistics, $this->selectedSeasonId);
    }

    public function logout(SupabaseSession $session): void
    {
        $session->logout();
        $this->redirect('/', navigate: true);
    }

    public function castMvpVote(string $matchId, string $playerId, SupabaseGateway $gateway): void
    {
        $match = $this->findById($this->matches, $matchId);
        if (! is_array($match) || $this->currentPlayerId === null) {
            return;
        }

        $participantIds = array_values(array_unique(array_column($match['participants'], 'player_id')));
        if (! in_array($this->currentPlayerId, $participantIds, true)
            || ! in_array($playerId, $participantIds, true)
            || $playerId === $this->currentPlayerId
            || in_array($matchId, $this->mvpDisabledMatchIds, true)) {
            return;
        }

        $gateway->rpc('cast_match_mvp_vote', [
            'p_match_id' => $matchId,
            'p_nominee_player_id' => $playerId,
        ]);
        $this->mvpVotes = $this->arrayRpc($gateway, 'get_league_match_mvp_votes');
        $this->statusMessage = 'Tu voto MVP se ha guardado.';
    }

    public function savePlayer(SupabaseGateway $gateway): void
    {
        $this->requireAdmin($gateway);
        $validated = $this->validate([
            'playerName' => ['required', 'string', 'min:2', 'max:120'],
            'playerHasCardio' => ['boolean'],
        ]);
        $parameters = [
            'p_name' => trim($validated['playerName']),
            'p_has_cardio' => $validated['playerHasCardio'],
        ];

        if ($this->editingPlayerId !== null) {
            $parameters['p_player_id'] = $this->editingPlayerId;
            $gateway->rpc('update_active_player', $parameters);
        } else {
            $gateway->rpc('create_active_player', $parameters);
        }

        $this->redirect('/mister/jugadores', navigate: true);
    }

    public function setPlayerActive(string $playerId, bool $active, SupabaseGateway $gateway): void
    {
        $this->requireAdmin($gateway);
        $gateway->rpc('set_player_active', [
            'p_player_id' => $playerId,
            'p_is_active' => $active,
        ]);
        $this->adminPlayers = $this->arrayRpc($gateway, 'get_admin_players');
        $this->statusMessage = $active ? 'Jugador activado.' : 'Jugador desactivado.';
    }

    public function deletePlayer(string $playerId, SupabaseGateway $gateway): void
    {
        $this->requireAdmin($gateway);
        $gateway->rpc('delete_player', ['p_player_id' => $playerId]);
        $this->adminPlayers = $this->arrayRpc($gateway, 'get_admin_players');
        $this->statusMessage = 'Jugador eliminado.';
    }

    public function addGoal(): void
    {
        $this->goals[] = ['player_id' => '', 'team' => 'A', 'count' => 1, 'is_own_goal' => false];
    }

    public function removeGoal(int $index): void
    {
        unset($this->goals[$index]);
        $this->goals = array_values($this->goals);
    }

    public function saveMatch(SupabaseGateway $gateway): void
    {
        $this->requireAdmin($gateway);
        $this->validateMatch();
        $teamA = array_values(array_unique($this->teamA));
        $teamB = array_values(array_unique($this->teamB));
        $participants = [];

        foreach (['A' => $teamA, 'B' => $teamB] as $team => $playerIds) {
            $goalkeepers = $team === 'A' ? $this->goalkeepersA : $this->goalkeepersB;
            foreach ($playerIds as $playerId) {
                $participants[] = [
                    'player_id' => $playerId,
                    'team' => $team,
                    'was_goalkeeper' => in_array($playerId, $goalkeepers, true),
                ];
            }
        }

        $goals = array_values(array_map(static fn (array $goal): array => [
            'player_id' => $goal['player_id'],
            'team' => $goal['team'],
            'count' => (int) $goal['count'],
            'is_own_goal' => (bool) ($goal['is_own_goal'] ?? false),
        ], array_filter($this->goals, static fn (array $goal): bool => ($goal['player_id'] ?? '') !== '' && (int) ($goal['count'] ?? 0) > 0)));
        $parameters = [
            'p_match_date' => $this->matchDate,
            'p_team_a_score' => $this->scoreA,
            'p_team_b_score' => $this->scoreB,
            'p_team_a_penalty_score' => $this->hasPenalties ? $this->penaltyA : null,
            'p_team_b_penalty_score' => $this->hasPenalties ? $this->penaltyB : null,
            'p_players' => $participants,
            'p_goals' => $goals,
        ];

        if ($this->editingMatchId !== null) {
            $parameters['p_match_id'] = $this->editingMatchId;
            $gateway->rpc('update_friendly_match_acta', $parameters);
        } else {
            $gateway->rpc('create_friendly_match_acta', $parameters);
            session()->forget('hattitriki.generated_teams');
        }

        $this->redirect('/mister/partidos', navigate: true);
    }

    public function deleteMatch(string $matchId, SupabaseGateway $gateway): void
    {
        $this->requireAdmin($gateway);
        $gateway->rpc('delete_friendly_match', ['p_match_id' => $matchId]);
        $this->adminMatches = $this->arrayRpc($gateway, 'get_admin_friendly_matches');
        $this->statusMessage = 'Partido eliminado.';
    }

    public function sendInvitation(SupabaseGateway $gateway): void
    {
        $this->requireAdmin($gateway);
        $validated = $this->validate([
            'invitationPlayerId' => ['required', 'uuid'],
            'invitationEmail' => ['required', 'email:rfc', 'max:254'],
        ]);
        $player = $this->findById($this->invitablePlayers, $validated['invitationPlayerId']);
        if (! is_array($player)) {
            throw ValidationException::withMessages(['invitationPlayerId' => 'El jugador ya no está disponible.']);
        }

        $email = mb_strtolower(trim($validated['invitationEmail']));
        $gateway->invokeFunction('send-league-invitation', [
            'playerId' => $validated['invitationPlayerId'],
            'email' => $email,
        ]);
        $this->invitationSuccess = ['email' => $email, 'playerName' => $player['name']];
        $this->invitablePlayers = array_values(array_filter(
            $this->invitablePlayers,
            static fn (array $item): bool => $item['id'] !== $validated['invitationPlayerId'],
        ));
    }

    public function resetInvitation(): void
    {
        $this->invitationSuccess = null;
        $this->reset(['invitationPlayerId', 'invitationEmail']);
    }

    public function selectAllPlayers(): void
    {
        $this->selectedPlayerIds = array_values(array_column($this->activePlayers, 'id'));
    }

    public function clearSelectedPlayers(): void
    {
        $this->selectedPlayerIds = [];
        $this->generatedTeams = [];
    }

    public function updatedSelectedPlayerIds(): void
    {
        $this->generatedTeams = [];
    }

    public function updatedTeamCount(): void
    {
        $this->generatedTeams = [];
    }

    public function updatedBalanceMode(): void
    {
        $this->generatedTeams = [];
    }

    public function generateTeams(LeagueStatistics $statistics): void
    {
        $validIds = array_column($this->activePlayers, 'id');
        $selectedIds = array_values(array_intersect($this->selectedPlayerIds, $validIds));
        if (count($selectedIds) < 2 || $this->teamCount < 2 || $this->teamCount > min(6, count($selectedIds))) {
            throw ValidationException::withMessages(['selectedPlayerIds' => 'Selecciona suficientes jugadores para el número de equipos.']);
        }
        if (! in_array($this->balanceMode, ['streak', 'historical'], true)) {
            throw ValidationException::withMessages(['balanceMode' => 'Selecciona un criterio de equilibrado válido.']);
        }

        $statsById = [];
        foreach ($statistics->stats($this->players, $this->matches, $this->mvpVotes) as $item) {
            $statsById[$item['player']['id']] = $item;
        }
        $players = array_values(array_map(function (array $player) use ($statsById): array {
            $stats = $statsById[$player['id']] ?? [];
            $player['statsScore'] = $this->balanceMode === 'historical'
                ? (float) ($stats['historicalScore'] ?? 0)
                : (float) ($stats['formScore'] ?? 0);

            return $player;
        }, array_filter($this->activePlayers, static fn (array $player): bool => in_array($player['id'], $selectedIds, true))));

        $this->generatedTeams = $statistics->balancedTeams($players, $this->teamCount, true);
    }

    public function createMatchFromTeams(): void
    {
        if (count($this->generatedTeams) !== 2) {
            return;
        }

        session()->put('hattitriki.generated_teams', [
            'teamA' => array_column($this->generatedTeams[0], 'id'),
            'teamB' => array_column($this->generatedTeams[1], 'id'),
        ]);
        $this->redirect('/mister/partidos/nuevo', navigate: true);
    }

    public function saveAvatar(SupabaseSession $session, SupabaseGateway $gateway): void
    {
        $this->validate(['avatar' => ['required', 'image', 'mimes:jpg,jpeg,webp', 'max:2441']]);
        $userId = $session->user()['id'] ?? null;
        if (! is_string($userId) || $userId === '') {
            throw ValidationException::withMessages(['avatar' => 'No se ha podido identificar tu cuenta.']);
        }

        $extension = mb_strtolower((string) $this->avatar->getClientOriginalExtension());
        $extension = in_array($extension, ['jpg', 'jpeg', 'webp'], true) ? $extension : 'jpg';
        $path = $userId.'/'.Str::uuid().'.'.$extension;
        $contents = file_get_contents($this->avatar->getRealPath());
        if (! is_string($contents)) {
            throw ValidationException::withMessages(['avatar' => 'No se ha podido leer la imagen.']);
        }

        $gateway->uploadAvatar($path, $contents, (string) $this->avatar->getMimeType());
        $gateway->rpc('set_own_avatar', ['p_avatar_path' => $path]);
        $this->avatar = null;
        $this->loadAvatars($gateway);
        $this->statusMessage = 'Foto de perfil actualizada.';
    }

    public function render(LeagueStatistics $statistics): View
    {
        $stats = $statistics->stats($this->players, $this->matches, $this->mvpVotes);
        $playersById = [];
        $statsById = [];
        foreach ($this->players as $player) {
            $playersById[$player['id']] = $player;
        }
        foreach ($stats as $item) {
            $statsById[$item['player']['id']] = $item;
        }
        $decodedResourceId = $statistics->fromHex($this->resourceId);

        return view('livewire.league-shell', [
            'stats' => $stats,
            'statsById' => $statsById,
            'playersById' => $playersById,
            'ranking' => $statistics->ranking($this->rankingCategory, $stats, count($this->matches)),
            'selectedMatch' => $this->findById($this->matches, $decodedResourceId),
            'selectedPlayerStats' => $statsById[$decodedResourceId] ?? null,
            'ownPlayerStats' => $this->currentPlayerId === null ? null : ($statsById[$this->currentPlayerId] ?? null),
            'statistics' => $statistics,
        ]);
    }

    private function loadAccess(SupabaseGateway $gateway, SupabaseSession $session): bool
    {
        $rows = $this->arrayRpc($gateway, 'get_current_user_access');
        $access = $rows[0] ?? null;
        if (! is_array($access) || ! ($access['is_member'] ?? false) || ! is_string($access['role'] ?? null)) {
            $session->forget();
            $this->redirect('/', navigate: true);

            return false;
        }

        $this->role = mb_strtolower($access['role']);
        $this->email = (string) ($session->user()['email'] ?? '');

        return true;
    }

    private function loadCore(SupabaseGateway $gateway, LeagueStatistics $statistics, ?int $seasonId = null): void
    {
        $this->players = $statistics->normalizePlayers($this->arrayRpc($gateway, 'get_public_league_players'));
        $seasonRows = $this->arrayRpc($gateway, 'get_league_seasons');
        $this->seasons = array_values(array_map(static fn (array $season): array => [
            'id' => (int) $season['id'],
            'number' => (int) $season['season_number'],
            'name' => (string) $season['name'],
            'isCurrent' => (bool) $season['is_current'],
            'matchCount' => (int) $season['match_count'],
        ], $seasonRows));
        $rememberedSeasonId = $seasonId ?? session('hattitriki.selected_season_id');
        $validSeasonIds = array_column($this->seasons, 'id');
        $this->selectedSeasonId = in_array($rememberedSeasonId, $validSeasonIds, true)
            ? $rememberedSeasonId
            : (($this->findFirst($this->seasons, static fn (array $season): bool => $season['isCurrent'])['id'] ?? null)
                ?? ($this->seasons[0]['id'] ?? null));
        $matchRows = $this->arrayRpc($gateway, 'get_public_friendly_matches', [
            'p_season_id' => $this->selectedSeasonId,
        ]);
        $this->matches = $statistics->normalizeMatches($matchRows);
        $currentPlayerRows = $this->safeArrayRpc($gateway, 'get_current_league_player_id');
        $this->currentPlayerId = isset($currentPlayerRows[0]['player_id']) ? (string) $currentPlayerRows[0]['player_id'] : null;
        $this->mvpVotes = $this->safeArrayRpc($gateway, 'get_league_match_mvp_votes');
        $this->mvpDisabledMatchIds = array_values(array_filter(array_map(
            static fn (array $row): ?string => isset($row['match_id']) ? (string) $row['match_id'] : null,
            $this->safeArrayRpc($gateway, 'get_mvp_voting_disabled_matches'),
        )));
        $this->loadAvatars($gateway);
    }

    private function loadAvatars(SupabaseGateway $gateway): void
    {
        $rows = $this->safeArrayRpc($gateway, 'get_league_player_avatars');
        $paths = array_values(array_filter(array_column($rows, 'avatar_path')));
        $signed = $paths === [] ? [] : $gateway->signedAvatarUrls($paths, 3600);
        $baseUrl = rtrim((string) config('services.supabase.url'), '/');
        $avatars = [];

        foreach ($rows as $index => $row) {
            $url = $signed[$index]['signedURL'] ?? $signed[$index]['signedUrl'] ?? null;
            if (is_string($url) && $url !== '' && isset($row['player_id'])) {
                $avatars[(string) $row['player_id']] = str_starts_with($url, 'http') ? $url : $baseUrl.'/storage/v1'.$url;
            }
        }

        $this->avatars = $avatars;
    }

    private function loadRouteData(SupabaseGateway $gateway, LeagueStatistics $statistics): void
    {
        if (! str_starts_with($this->routeName, 'manager.')) {
            return;
        }

        if ($this->role !== 'admin') {
            return;
        }

        if (str_starts_with($this->routeName, 'manager.players.')) {
            $this->adminPlayers = $this->arrayRpc($gateway, 'get_admin_players');
            if ($this->routeName === 'manager.players.edit') {
                $playerId = $statistics->fromHex($this->resourceId);
                $player = $this->findById($this->adminPlayers, $playerId);
                if (is_array($player)) {
                    $this->editingPlayerId = $playerId;
                    $this->playerName = (string) $player['name'];
                    $this->playerHasCardio = (bool) ($player['has_cardio'] ?? false);
                }
            }
        }

        if (str_starts_with($this->routeName, 'manager.matches.')) {
            $this->adminMatches = $this->arrayRpc($gateway, 'get_admin_friendly_matches');
            if (in_array($this->routeName, ['manager.matches.create', 'manager.matches.edit'], true)) {
                $this->activePlayers = $this->arrayRpc($gateway, 'get_active_players');
                $this->matchDate = now()->toDateString();
                $this->goals = [['player_id' => '', 'team' => 'A', 'count' => 1, 'is_own_goal' => false]];
                if ($this->routeName === 'manager.matches.edit') {
                    $this->loadMatchDraft($gateway, $statistics->fromHex($this->resourceId));
                } else {
                    $draft = session('hattitriki.generated_teams', []);
                    $this->teamA = is_array($draft['teamA'] ?? null) ? $draft['teamA'] : [];
                    $this->teamB = is_array($draft['teamB'] ?? null) ? $draft['teamB'] : [];
                }
            }
        }

        if ($this->routeName === 'manager.invitation') {
            $this->invitablePlayers = $this->arrayRpc($gateway, 'get_invitable_players');
        }

        if (in_array($this->routeName, ['manager.teams.index', 'manager.teams.result'], true)) {
            $this->activePlayers = $this->arrayRpc($gateway, 'get_active_players');
            $this->selectedPlayerIds = array_column($this->activePlayers, 'id');
        }
    }

    private function loadMatchDraft(SupabaseGateway $gateway, string $matchId): void
    {
        $rows = $this->arrayRpc($gateway, 'get_friendly_match_acta', ['p_match_id' => $matchId]);
        $draft = $rows[0] ?? null;
        if (! is_array($draft)) {
            return;
        }

        $this->editingMatchId = $matchId;
        $this->matchDate = (string) $draft['match_date'];
        $this->scoreA = (int) $draft['team_a_score'];
        $this->scoreB = (int) $draft['team_b_score'];
        $this->penaltyA = isset($draft['team_a_penalty_score']) ? (int) $draft['team_a_penalty_score'] : null;
        $this->penaltyB = isset($draft['team_b_penalty_score']) ? (int) $draft['team_b_penalty_score'] : null;
        $this->hasPenalties = $this->penaltyA !== null;
        $participants = is_array($draft['participants'] ?? null) ? $draft['participants'] : [];
        $this->teamA = array_values(array_column(array_filter($participants, static fn (array $item): bool => $item['team'] === 'A'), 'player_id'));
        $this->teamB = array_values(array_column(array_filter($participants, static fn (array $item): bool => $item['team'] === 'B'), 'player_id'));
        $this->goalkeepersA = array_values(array_column(array_filter($participants, static fn (array $item): bool => $item['team'] === 'A' && ($item['was_goalkeeper'] ?? false)), 'player_id'));
        $this->goalkeepersB = array_values(array_column(array_filter($participants, static fn (array $item): bool => $item['team'] === 'B' && ($item['was_goalkeeper'] ?? false)), 'player_id'));
        $this->goals = is_array($draft['goals'] ?? null) && $draft['goals'] !== []
            ? array_values($draft['goals'])
            : [['player_id' => '', 'team' => 'A', 'count' => 1, 'is_own_goal' => false]];
    }

    private function validateMatch(): void
    {
        $validPlayerIds = array_column($this->activePlayers, 'id');
        $this->validate([
            'matchDate' => ['required', 'date'],
            'scoreA' => ['required', 'integer', 'min:0', 'max:99'],
            'scoreB' => ['required', 'integer', 'min:0', 'max:99'],
            'teamA' => ['required', 'array', 'min:1'],
            'teamA.*' => [Rule::in($validPlayerIds)],
            'teamB' => ['required', 'array', 'min:1'],
            'teamB.*' => [Rule::in($validPlayerIds)],
            'goals' => ['array'],
            'goals.*.player_id' => ['nullable', Rule::in($validPlayerIds)],
            'goals.*.team' => ['required_with:goals.*.player_id', Rule::in(['A', 'B'])],
            'goals.*.count' => ['nullable', 'integer', 'min:1', 'max:99'],
        ]);

        if ($this->hasPenalties && ($this->scoreA !== $this->scoreB || $this->penaltyA === $this->penaltyB
            || $this->penaltyA === null || $this->penaltyB === null)) {
            throw ValidationException::withMessages(['penaltyA' => 'Los penaltis requieren empate y un ganador claro.']);
        }

        $teamA = array_values(array_unique($this->teamA));
        $teamB = array_values(array_unique($this->teamB));
        if (array_intersect($teamA, $teamB) !== []) {
            throw ValidationException::withMessages(['teamB' => 'Un jugador no puede pertenecer a los dos equipos.']);
        }

        if (array_intersect($this->goalkeepersA, $teamA) === [] || array_intersect($this->goalkeepersB, $teamB) === []) {
            throw ValidationException::withMessages(['goalkeepersA' => 'Cada equipo necesita al menos un portero.']);
        }

        $assigned = ['A' => 0, 'B' => 0];
        foreach ($this->goals as $goal) {
            if (($goal['player_id'] ?? '') !== '' && isset($assigned[$goal['team'] ?? ''])) {
                $assigned[$goal['team']] += (int) ($goal['count'] ?? 0);

                $playerId = (string) $goal['player_id'];
                $playerTeam = in_array($playerId, $teamA, true) ? 'A' : (in_array($playerId, $teamB, true) ? 'B' : null);
                $expectedTeam = (bool) ($goal['is_own_goal'] ?? false)
                    ? ($playerTeam === 'A' ? 'B' : 'A')
                    : $playerTeam;
                if ($playerTeam === null || $expectedTeam !== $goal['team']) {
                    throw ValidationException::withMessages(['goals' => 'Cada goleador debe corresponder con su equipo; en propia puerta, con el rival.']);
                }
            }
        }
        if ($assigned['A'] !== $this->scoreA || $assigned['B'] !== $this->scoreB) {
            throw ValidationException::withMessages(['goals' => 'Los goles asignados deben coincidir con el marcador.']);
        }
    }

    private function requireAdmin(SupabaseGateway $gateway): void
    {
        $access = $this->arrayRpc($gateway, 'get_current_user_access')[0] ?? null;
        abort_unless(is_array($access) && ($access['is_member'] ?? false) && ($access['role'] ?? null) === 'admin', 403);
    }

    private function arrayRpc(SupabaseGateway $gateway, string $function, array $parameters = []): array
    {
        $result = $gateway->rpc($function, $parameters);

        return is_array($result) ? array_values($result) : [];
    }

    private function safeArrayRpc(SupabaseGateway $gateway, string $function, array $parameters = []): array
    {
        try {
            return $this->arrayRpc($gateway, $function, $parameters);
        } catch (SupabaseApiException) {
            return [];
        }
    }

    private function findById(array $items, ?string $id): ?array
    {
        return $this->findFirst($items, static fn (array $item): bool => ($item['id'] ?? null) === $id);
    }

    private function findFirst(array $items, callable $callback): ?array
    {
        foreach ($items as $item) {
            if (is_array($item) && $callback($item)) {
                return $item;
            }
        }

        return null;
    }
}
