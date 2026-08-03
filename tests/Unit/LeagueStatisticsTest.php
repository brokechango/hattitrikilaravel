<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Services\LeagueStatistics;
use PHPUnit\Framework\TestCase;

final class LeagueStatisticsTest extends TestCase
{
    private LeagueStatistics $statistics;

    protected function setUp(): void
    {
        $this->statistics = new LeagueStatistics;
    }

    public function test_hex_identifiers_match_the_existing_browser_contract(): void
    {
        $encoded = $this->statistics->toHex('jugador-á');

        $this->assertSame('6a756761646f722dc3a1', $encoded);
        $this->assertSame('jugador-á', $this->statistics->fromHex($encoded));
        $this->assertSame('', $this->statistics->fromHex('xyz'));
    }

    public function test_stats_keep_goalkeeper_and_weighted_elo_parity(): void
    {
        [$players, $matches] = $this->fixture();
        $stats = $this->statistics->stats($players, $matches);
        $byPlayer = [];
        foreach ($stats as $item) {
            $byPlayer[$item['player']['id']] = $item;
        }

        $this->assertSame(2, $byPlayer['ana']['matchesPlayed']);
        $this->assertSame(2, $byPlayer['ana']['wins']);
        $this->assertSame(2, $byPlayer['ana']['goals']);
        $this->assertSame(0.0, $byPlayer['ana']['goalsAgainst']);
        $this->assertSame(1.0, $byPlayer['bea']['goalsAgainst']);
        $this->assertSame(1.0, $byPlayer['carla']['goalsAgainst']);
        $this->assertEqualsWithDelta(17.835, $byPlayer['ana']['formScore'], 0.001);
        $this->assertEqualsWithDelta(1021.035, $byPlayer['ana']['eloRating'], 0.001);
        $this->assertEqualsWithDelta(-14.635, $byPlayer['bea']['formScore'], 0.001);
        $this->assertFalse($byPlayer['carla']['isFormEligible']);
        $this->assertSame(['win', 'win', 'pending', 'pending', 'pending'], $byPlayer['ana']['recentForm']);
    }

    public function test_rankings_and_goal_aggregation_follow_existing_rules(): void
    {
        [$players, $matches] = $this->fixture();
        $stats = $this->statistics->stats($players, $matches, [
            ['nominee_player_id' => 'bea', 'vote_count' => 3],
        ]);

        $this->assertSame('ana', $this->statistics->ranking('top-scorer', $stats, 2)[0]['player']['id']);
        $this->assertSame('bea', $this->statistics->ranking('people-favourite', $stats, 2)[0]['player']['id']);
        $this->assertSame([
            [
                'player_id' => 'ana',
                'count' => 2,
                'is_own_goal' => false,
                'team' => 'A',
            ],
        ], $this->statistics->aggregateGoals([
            ['player_id' => 'ana', 'count' => 1, 'is_own_goal' => false],
            ['player_id' => 'ana', 'count' => 1, 'is_own_goal' => false],
        ], [['player_id' => 'ana', 'team' => 'A']]));
    }

    public function test_balanced_teams_minimize_the_real_statistics_point_difference(): void
    {
        $teams = $this->statistics->balancedTeams($this->scoredPlayers([14, 13, 8, 7, 5, 3]), 2);

        $this->assertSame([25.0, 25.0], $this->sortedTeamScores($teams));
        $this->assertSame([3, 3], array_map('count', $teams));
    }

    public function test_balancing_does_not_shift_negative_scores_when_team_sizes_differ(): void
    {
        $teams = $this->statistics->balancedTeams($this->scoredPlayers([-100, 50, 40, 30, 20]), 2);
        $scores = $this->sortedTeamScores($teams);
        $sizes = array_map('count', $teams);
        sort($sizes);

        $this->assertSame([-10.0, 50.0], $scores);
        $this->assertSame(60.0, $scores[1] - $scores[0]);
        $this->assertSame([2, 3], $sizes);
    }

    public function test_balanced_teams_use_cardio_only_after_equalizing_points(): void
    {
        $players = $this->scoredPlayers([10, 10, 10, 10]);
        $players[0]['has_cardio'] = true;
        $players[1]['has_cardio'] = true;

        $teams = $this->statistics->balancedTeams($players, 2);

        $this->assertSame([20.0, 20.0], $this->sortedTeamScores($teams));
        $this->assertSame([1, 1], array_map(
            static fn (array $team): int => count(array_filter($team, static fn (array $player): bool => $player['has_cardio'])),
            $teams,
        ));
    }

    /** @return list<array{id: string, name: string, statsScore: float, has_cardio: bool}> */
    private function scoredPlayers(array $scores): array
    {
        return array_values(array_map(static fn (int|float $score, int $index): array => [
            'id' => 'player-'.$index,
            'name' => 'Player '.$index,
            'statsScore' => (float) $score,
            'has_cardio' => false,
        ], $scores, array_keys($scores)));
    }

    /** @return list<float> */
    private function sortedTeamScores(array $teams): array
    {
        $scores = array_map(
            static fn (array $team): float => array_sum(array_column($team, 'statsScore')),
            $teams,
        );
        sort($scores);

        return $scores;
    }

    /** @return array{list<array<string, mixed>>, list<array<string, mixed>>} */
    private function fixture(): array
    {
        return [[
            ['id' => 'ana', 'name' => 'Ana'],
            ['id' => 'bea', 'name' => 'Bea'],
            ['id' => 'carla', 'name' => 'Carla'],
        ], [
            [
                'id' => 'm2',
                'playedOn' => '2026-07-08',
                'teamAScore' => 0,
                'teamBScore' => 0,
                'teamAPenaltyScore' => 3,
                'teamBPenaltyScore' => 2,
                'participants' => [
                    ['player_id' => 'ana', 'team' => 'A', 'was_goalkeeper' => true],
                    ['player_id' => 'bea', 'team' => 'B', 'was_goalkeeper' => false],
                ],
                'goals' => [],
            ],
            [
                'id' => 'm1',
                'playedOn' => '2026-07-01',
                'teamAScore' => 2,
                'teamBScore' => 1,
                'teamAPenaltyScore' => null,
                'teamBPenaltyScore' => null,
                'participants' => [
                    ['player_id' => 'ana', 'team' => 'A', 'was_goalkeeper' => false],
                    ['player_id' => 'bea', 'team' => 'B', 'was_goalkeeper' => true],
                    ['player_id' => 'carla', 'team' => 'B', 'was_goalkeeper' => true],
                ],
                'goals' => [
                    ['player_id' => 'ana', 'count' => 2, 'is_own_goal' => false],
                    ['player_id' => 'carla', 'count' => 1, 'is_own_goal' => false],
                ],
            ],
        ]];
    }
}
