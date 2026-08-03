<?php

declare(strict_types=1);

namespace Tests\Feature\Livewire;

use App\Livewire\LeagueShell;
use App\Services\Supabase\SupabaseSession;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Livewire\Livewire;
use Tests\TestCase;

final class LeagueShellTest extends TestCase
{
    private const PLAYER_A = '11111111-1111-4111-8111-111111111111';

    private const PLAYER_B = '22222222-2222-4222-8222-222222222222';

    protected function setUp(): void
    {
        parent::setUp();

        config()->set('services.supabase.url', 'https://project.supabase.co');
        config()->set('services.supabase.publishable_key', 'sb_publishable_test');
    }

    public function test_member_home_is_rendered_from_server_data(): void
    {
        $this->fakeLeague('member');
        $this->authenticate();

        Livewire::test(LeagueShell::class, $this->route('home', '/inicio'))
            ->assertSet('role', 'member')
            ->assertSet('currentPlayerId', self::PLAYER_A)
            ->assertSet('selectedSeasonId', 7)
            ->assertSee('Liga Genuine')
            ->assertSee('Ana')
            ->assertSee('3 : 1')
            ->assertDontSee('Míster');

        Http::assertSent(fn (Request $request): bool => str_ends_with($request->url(), '/rest/v1/rpc/get_public_friendly_matches')
            && $request->hasHeader('Authorization'));
    }

    public function test_revoked_member_is_redirected_without_loading_league_data(): void
    {
        $this->fakeLeague('member', false);
        $this->authenticate();

        Livewire::test(LeagueShell::class, $this->route('home', '/inicio'))
            ->assertRedirect('/');

        Http::assertNotSent(fn (Request $request): bool => str_contains($request->url(), 'get_public_league_players'));
    }

    public function test_non_admin_cannot_load_or_use_manager_tools(): void
    {
        $this->fakeLeague('member');
        $this->authenticate();

        Livewire::test(LeagueShell::class, $this->route('manager.players.index', '/mister/jugadores'))
            ->assertSee('Acceso restringido')
            ->assertSet('adminPlayers', []);

        Http::assertNotSent(fn (Request $request): bool => str_contains($request->url(), 'get_admin_players'));
    }

    public function test_admin_can_create_a_player_and_permission_is_rechecked_on_write(): void
    {
        $this->fakeLeague('admin');
        $this->authenticate();

        Livewire::test(LeagueShell::class, $this->route('manager.players.create', '/mister/jugadores/nuevo'))
            ->set('playerName', '  Carla  ')
            ->set('playerHasCardio', true)
            ->call('savePlayer')
            ->assertHasNoErrors()
            ->assertRedirect('/mister/jugadores');

        Http::assertSent(fn (Request $request): bool => str_ends_with($request->url(), '/rest/v1/rpc/create_active_player')
            && $request->data() === ['p_name' => 'Carla', 'p_has_cardio' => true]);
        $accessChecks = Http::recorded(fn (Request $request): bool => str_ends_with($request->url(), '/rest/v1/rpc/get_current_user_access'));
        $this->assertCount(2, $accessChecks);
    }

    public function test_match_form_rejects_a_score_that_does_not_match_goal_attribution(): void
    {
        $this->fakeLeague('admin');
        $this->authenticate();

        Livewire::test(LeagueShell::class, $this->route('manager.matches.create', '/mister/partidos/nuevo'))
            ->set('matchDate', '2026-08-03')
            ->set('scoreA', 2)
            ->set('scoreB', 0)
            ->set('teamA', [self::PLAYER_A])
            ->set('teamB', [self::PLAYER_B])
            ->set('goalkeepersA', [self::PLAYER_A])
            ->set('goalkeepersB', [self::PLAYER_B])
            ->set('goals', [])
            ->call('saveMatch')
            ->assertHasErrors('goals');

        Http::assertNotSent(fn (Request $request): bool => str_contains($request->url(), 'create_friendly_match_acta'));
    }

    public function test_admin_can_generate_two_teams_and_open_a_prefilled_acta(): void
    {
        $this->fakeLeague('admin');
        $this->authenticate();

        Livewire::test(LeagueShell::class, $this->route('manager.teams.index', '/mister/equipos'))
            ->set('selectedPlayerIds', [self::PLAYER_A, self::PLAYER_B])
            ->set('teamCount', 2)
            ->call('generateTeams')
            ->assertSet('generatedTeams', fn (array $teams): bool => count($teams) === 2 && count($teams[0]) === 1 && count($teams[1]) === 1)
            ->call('createMatchFromTeams')
            ->assertRedirect('/mister/partidos/nuevo');

        $draft = session('hattitriki.generated_teams');
        $this->assertCount(1, $draft['teamA']);
        $this->assertCount(1, $draft['teamB']);
    }

    private function fakeLeague(string $role, bool $isMember = true): void
    {
        Http::fake(function (Request $request) use ($role, $isMember) {
            $function = str_contains($request->url(), '/rest/v1/rpc/')
                ? substr($request->url(), strrpos($request->url(), '/') + 1)
                : null;

            return match ($function) {
                'get_current_user_access' => Http::response([['is_member' => $isMember, 'role' => $isMember ? $role : null]]),
                'get_public_league_players' => Http::response([
                    ['id' => self::PLAYER_A, 'name' => 'Ana', 'is_active' => true, 'has_cardio' => true],
                    ['id' => self::PLAYER_B, 'name' => 'Bruno', 'is_active' => true, 'has_cardio' => false],
                ]),
                'get_league_seasons' => Http::response([['id' => 7, 'season_number' => 3, 'name' => 'Temporada 3', 'is_current' => true, 'match_count' => 1]]),
                'get_public_friendly_matches' => Http::response([[
                    'id' => '33333333-3333-4333-8333-333333333333',
                    'played_on' => '2026-08-02',
                    'season_id' => 7,
                    'team_a_score' => 3,
                    'team_b_score' => 1,
                    'team_a_penalty_score' => null,
                    'team_b_penalty_score' => null,
                    'participants' => [
                        ['player_id' => self::PLAYER_A, 'team' => 'A', 'was_goalkeeper' => false],
                        ['player_id' => self::PLAYER_B, 'team' => 'B', 'was_goalkeeper' => true],
                    ],
                    'goals' => [['player_id' => self::PLAYER_A, 'team' => 'A', 'count' => 3, 'is_own_goal' => false]],
                ]]),
                'get_current_league_player_id' => Http::response([['player_id' => self::PLAYER_A]]),
                'get_league_match_mvp_votes', 'get_mvp_voting_disabled_matches', 'get_league_player_avatars' => Http::response([]),
                'get_admin_players' => Http::response([
                    ['id' => self::PLAYER_A, 'name' => 'Ana', 'is_active' => true, 'has_cardio' => true],
                    ['id' => self::PLAYER_B, 'name' => 'Bruno', 'is_active' => true, 'has_cardio' => false],
                ]),
                'get_admin_friendly_matches' => Http::response([]),
                'get_active_players' => Http::response([
                    ['id' => self::PLAYER_A, 'name' => 'Ana', 'is_active' => true, 'has_cardio' => true],
                    ['id' => self::PLAYER_B, 'name' => 'Bruno', 'is_active' => true, 'has_cardio' => false],
                ]),
                'get_invitable_players' => Http::response([['id' => self::PLAYER_B, 'name' => 'Bruno']]),
                'create_active_player' => Http::response(null, 204),
                default => str_ends_with($request->url(), '/auth/v1/user')
                    ? Http::response(['id' => 'user-1', 'email' => 'member@example.com'])
                    : Http::response([], 404),
            };
        });
    }

    private function authenticate(): void
    {
        $this->app->make(SupabaseSession::class)->import($this->token(), 'refresh-token');
    }

    /** @return array<string, string|null> */
    private function route(string $routeName, string $routePath, ?string $resourceId = null): array
    {
        return compact('routeName', 'routePath', 'resourceId');
    }

    private function token(): string
    {
        $encode = static fn (array $value): string => rtrim(strtr(base64_encode((string) json_encode($value, JSON_THROW_ON_ERROR)), '+/', '-_'), '=');

        return $encode(['alg' => 'HS256']).'.'.$encode(['exp' => now()->addHour()->timestamp]).'.signature';
    }
}
