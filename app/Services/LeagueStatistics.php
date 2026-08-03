<?php

declare(strict_types=1);

namespace App\Services;

final class LeagueStatistics
{
    private const INITIAL_ELO = 1000.0;

    private const ELO_K = 24.0;

    private const FORM_WEIGHTS = [1.0, 0.8, 0.6, 0.4, 0.2];

    public function winner(array $match): ?string
    {
        $scoreA = (int) ($match['teamAScore'] ?? $match['team_a_score'] ?? 0);
        $scoreB = (int) ($match['teamBScore'] ?? $match['team_b_score'] ?? 0);

        if ($scoreA > $scoreB) {
            return 'A';
        }

        if ($scoreB > $scoreA) {
            return 'B';
        }

        $penaltyA = $match['teamAPenaltyScore'] ?? $match['team_a_penalty_score'] ?? null;
        $penaltyB = $match['teamBPenaltyScore'] ?? $match['team_b_penalty_score'] ?? null;

        if ($penaltyA !== null && $penaltyB !== null && (int) $penaltyA !== (int) $penaltyB) {
            return (int) $penaltyA > (int) $penaltyB ? 'A' : 'B';
        }

        return null;
    }

    /** @return list<array<string, mixed>> */
    public function normalizePlayers(array $players): array
    {
        return array_values(array_map(static fn (array $player): array => [
            'id' => (string) $player['id'],
            'name' => (string) $player['name'],
            'isActive' => (bool) ($player['is_active'] ?? true),
            'has_cardio' => (bool) ($player['has_cardio'] ?? false),
        ], $players));
    }

    /** @return list<array<string, mixed>> */
    public function normalizeMatches(array $matches): array
    {
        $normalized = array_map(static fn (array $match): array => [
            'id' => (string) $match['id'],
            'playedOn' => (string) ($match['played_on'] ?? ''),
            'seasonId' => isset($match['season_id']) ? (int) $match['season_id'] : null,
            'teamAScore' => (int) ($match['team_a_score'] ?? 0),
            'teamBScore' => (int) ($match['team_b_score'] ?? 0),
            'teamAPenaltyScore' => isset($match['team_a_penalty_score']) ? (int) $match['team_a_penalty_score'] : null,
            'teamBPenaltyScore' => isset($match['team_b_penalty_score']) ? (int) $match['team_b_penalty_score'] : null,
            'participants' => is_array($match['participants'] ?? null) ? $match['participants'] : [],
            'goals' => is_array($match['goals'] ?? null) ? $match['goals'] : [],
        ], $matches);

        usort($normalized, static fn (array $a, array $b): int => strcmp($b['playedOn'], $a['playedOn']));

        return array_values($normalized);
    }

    /** @return list<array<string, mixed>> */
    public function stats(array $players, array $matches, array $mvpVotes = []): array
    {
        $goalkeeperShare = [];
        $formMetrics = $this->formMetrics($players, $matches);
        $voteCounts = [];

        foreach ($mvpVotes as $vote) {
            $playerId = $vote['nominee_player_id'] ?? null;
            if (is_string($playerId) && $playerId !== '') {
                $voteCounts[$playerId] = ($voteCounts[$playerId] ?? 0) + (int) ($vote['vote_count'] ?? 0);
            }
        }

        foreach ($matches as $match) {
            foreach (['A', 'B'] as $team) {
                $keepers = [];
                foreach ($match['participants'] ?? [] as $participant) {
                    if (($participant['team'] ?? null) === $team && ($participant['was_goalkeeper'] ?? false)) {
                        $keepers[(string) $participant['player_id']] = true;
                    }
                }

                $keeperIds = array_keys($keepers);
                $conceded = $team === 'A' ? (int) $match['teamBScore'] : (int) $match['teamAScore'];
                foreach ($keeperIds as $keeperId) {
                    $goalkeeperShare[$keeperId] = ($goalkeeperShare[$keeperId] ?? 0)
                        + $conceded / max(count($keeperIds), 1);
                }
            }
        }

        return array_values(array_map(function (array $player) use ($matches, $goalkeeperShare, $formMetrics, $voteCounts): array {
            $playerId = (string) $player['id'];
            $played = array_values(array_filter($matches, fn (array $match): bool => $this->any(
                $match['participants'] ?? [],
                static fn (array $participant): bool => ($participant['player_id'] ?? null) === $playerId,
            )));
            $wins = 0;
            $draws = 0;

            foreach ($played as $match) {
                $participant = $this->first(
                    $match['participants'],
                    static fn (array $entry): bool => ($entry['player_id'] ?? null) === $playerId,
                );
                $winner = $this->winner($match);
                if ($winner === null) {
                    $draws++;
                } elseif (($participant['team'] ?? null) === $winner) {
                    $wins++;
                }
            }

            $goals = 0;
            foreach ($matches as $match) {
                foreach ($match['goals'] ?? [] as $goal) {
                    if (($goal['player_id'] ?? null) === $playerId && ! ($goal['is_own_goal'] ?? false)) {
                        $goals += (int) ($goal['count'] ?? 0);
                    }
                }
            }

            $goalkeeperMatches = count(array_filter($played, fn (array $match): bool => $this->any(
                $match['participants'] ?? [],
                static fn (array $participant): bool => ($participant['player_id'] ?? null) === $playerId
                    && ($participant['was_goalkeeper'] ?? false),
            )));
            $goalsAgainst = $goalkeeperMatches > 0 ? (float) ($goalkeeperShare[$playerId] ?? 0) : null;
            $recentForm = [];

            foreach (array_reverse(array_slice($matches, 0, 5)) as $match) {
                $participant = $this->first(
                    $match['participants'] ?? [],
                    static fn (array $entry): bool => ($entry['player_id'] ?? null) === $playerId,
                );
                if (! is_array($participant)) {
                    $recentForm[] = 'none';

                    continue;
                }

                $winner = $this->winner($match);
                $recentForm[] = $winner === null ? 'draw' : (($participant['team'] ?? null) === $winner ? 'win' : 'loss');
            }
            while (count($recentForm) < 5) {
                $recentForm[] = 'pending';
            }

            $goalkeeperAdjustment = $goalsAgainst === null ? 0 : max(0, $goalkeeperMatches * 2 - $goalsAgainst);

            return array_merge([
                'player' => $player,
                'matchesPlayed' => count($played),
                'wins' => $wins,
                'draws' => $draws,
                'losses' => count($played) - $wins - $draws,
                'goals' => $goals,
                'goalkeeperMatches' => $goalkeeperMatches,
                'goalsAgainst' => $goalsAgainst,
                'goalsPerMatch' => $goals / max(count($played), 1),
                'goalsAgainstPerMatch' => $goalsAgainst === null ? null : $goalsAgainst / max($goalkeeperMatches, 1),
                'assignedGoalsAgainst' => $goalsAgainst,
                'totalPerformance' => count($played) + $goals + $wins + $goalkeeperAdjustment,
                'recentForm' => $recentForm,
                'mvpVotes' => $voteCounts[$playerId] ?? 0,
            ], $formMetrics[$playerId] ?? []);
        }, $players));
    }

    /** @return list<array<string, mixed>> */
    public function ranking(string $category, array $stats, int $seasonMatchCount): array
    {
        $filtered = array_values(array_filter($stats, static fn (array $item): bool => mb_strtolower(trim(
            (string) ($item['player']['name'] ?? ''),
        )) !== 'chango'));

        $filtered = match ($category) {
            'goals-per-match' => array_values(array_filter($filtered, static fn (array $item): bool => $seasonMatchCount > 0
                && (int) $item['matchesPlayed'] * 2 >= $seasonMatchCount)),
            'zamora', 'goals-conceded-per-match' => array_values(array_filter($filtered, static fn (array $item): bool => (int) $item['goalkeeperMatches'] > 0)),
            'player-on-form' => array_values(array_filter($filtered, static fn (array $item): bool => (bool) ($item['isFormEligible'] ?? false))),
            'people-favourite' => array_values(array_filter($filtered, static fn (array $item): bool => (int) $item['mvpVotes'] > 0)),
            default => $filtered,
        };

        usort($filtered, fn (array $a, array $b): int => match ($category) {
            'goals-per-match' => $this->compare($b['goalsPerMatch'], $a['goalsPerMatch']) ?: $this->compare($b['goals'], $a['goals']),
            'zamora' => $this->compare($a['goalsAgainst'], $b['goalsAgainst']) ?: $this->compare($b['goalkeeperMatches'], $a['goalkeeperMatches']) ?: $this->compare($b['wins'], $a['wins']),
            'goals-conceded-per-match' => $this->compare($a['goalsAgainstPerMatch'], $b['goalsAgainstPerMatch']) ?: $this->compare($b['goalkeeperMatches'], $a['goalkeeperMatches']) ?: $this->compare($b['wins'], $a['wins']),
            'most-played' => $this->compare($b['matchesPlayed'], $a['matchesPlayed']) ?: $this->compare($b['wins'], $a['wins']),
            'most-wins' => $this->compare($b['wins'], $a['wins']) ?: $this->compare($b['goals'], $a['goals']),
            'player-on-form' => $this->compare($b['formScore'], $a['formScore']) ?: $this->compare($b['latestFormImpact'], $a['latestFormImpact']) ?: strcasecmp($a['player']['name'], $b['player']['name']),
            'people-favourite' => $this->compare($b['mvpVotes'], $a['mvpVotes']) ?: $this->compare($b['matchesPlayed'], $a['matchesPlayed']) ?: strcasecmp($a['player']['name'], $b['player']['name']),
            default => $this->compare($b['goals'], $a['goals']) ?: $this->compare($b['wins'], $a['wins']),
        });

        return $filtered;
    }

    public function toHex(string $value): string
    {
        return bin2hex($value);
    }

    public function fromHex(?string $value): string
    {
        if (! is_string($value) || preg_match('/^(?:[0-9a-f]{2})+$/i', $value) !== 1) {
            return '';
        }

        $decoded = hex2bin($value);

        return $decoded === false ? '' : $decoded;
    }

    /** @return list<array<string, mixed>> */
    public function aggregateGoals(array $goals, array $participants = []): array
    {
        $entries = [];
        foreach ($goals as $goal) {
            $count = (int) ($goal['count'] ?? 0);
            if ($count <= 0) {
                continue;
            }

            $playerId = (string) ($goal['player_id'] ?? '');
            $participant = $this->first($participants, static fn (array $item): bool => ($item['player_id'] ?? null) === $playerId);
            $team = (string) ($goal['team'] ?? $participant['team'] ?? 'A');
            $ownGoal = (bool) ($goal['is_own_goal'] ?? false);
            $key = $playerId.':'.$team.':'.($ownGoal ? '1' : '0');

            if (isset($entries[$key])) {
                $entries[$key]['count'] += $count;
            } else {
                unset($goal['goalkeeper_id']);
                $entries[$key] = array_merge($goal, [
                    'team' => $team,
                    'count' => $count,
                ]);
            }
        }

        return array_values($entries);
    }

    /** @return list<list<array<string, mixed>>> */
    public function balancedTeams(array $players, int $teamCount, bool $balanceStats = true): array
    {
        if ($players === [] || $teamCount < 2 || $teamCount > count($players)) {
            return [];
        }

        foreach ($players as &$player) {
            $player['statsScore'] = (float) ($player['statsScore'] ?? 0);
        }
        unset($player);

        $extraTeams = count($players) % $teamCount;
        $capacities = [];
        for ($index = 0; $index < $teamCount; $index++) {
            $capacities[] = intdiv(count($players), $teamCount) + ($index < $extraTeams ? 1 : 0);
        }

        if ($balanceStats && $teamCount === 2 && count($players) <= 22) {
            return $this->exactTwoTeamBalance($players, $capacities);
        }

        if (count($players) <= 12) {
            $exactTeams = $this->exactTeamBalance($players, $capacities, $balanceStats);
            if ($exactTeams !== null) {
                return $exactTeams;
            }
        }

        return $this->heuristicTeamBalance($players, $capacities, $balanceStats);
    }

    /** @return list<list<array<string, mixed>>> */
    private function exactTwoTeamBalance(array $players, array $capacities): array
    {
        $firstCapacity = $capacities[0];
        $playerCount = count($players);
        $totalScore = array_sum(array_column($players, 'statsScore'));
        $totalCardio = count(array_filter($players, static fn (array $player): bool => (bool) ($player['has_cardio'] ?? false)));
        $bestSelection = [];
        $bestObjective = null;
        $equivalentSolutions = 0;
        $selected = [];

        $search = function (int $nextIndex, int $remaining, float $score, int $cardio) use (
            &$search,
            &$bestSelection,
            &$bestObjective,
            &$equivalentSolutions,
            &$selected,
            $players,
            $playerCount,
            $totalScore,
            $totalCardio,
        ): void {
            if ($remaining === 0) {
                $objective = [
                    abs($score - ($totalScore - $score)),
                    abs($cardio - ($totalCardio - $cardio)),
                ];

                if ($this->objectiveIsBetter($objective, $bestObjective)) {
                    $bestObjective = $objective;
                    $bestSelection = $selected;
                    $equivalentSolutions = 1;
                } elseif ($this->objectivesAreEqual($objective, $bestObjective)) {
                    $equivalentSolutions++;
                    if (mt_rand(1, $equivalentSolutions) === 1) {
                        $bestSelection = $selected;
                    }
                }

                return;
            }

            if ($playerCount - $nextIndex < $remaining) {
                return;
            }

            for ($index = $nextIndex; $index <= $playerCount - $remaining; $index++) {
                $selected[] = $index;
                $player = $players[$index];
                $search(
                    $index + 1,
                    $remaining - 1,
                    $score + (float) $player['statsScore'],
                    $cardio + ((bool) ($player['has_cardio'] ?? false) ? 1 : 0),
                );
                array_pop($selected);
            }
        };

        $search(0, $firstCapacity, 0.0, 0);
        $selectedLookup = array_fill_keys($bestSelection, true);
        $teams = [[], []];
        foreach ($players as $index => $player) {
            $teams[isset($selectedLookup[$index]) ? 0 : 1][] = $player;
        }

        return $teams;
    }

    /** @return list<list<array<string, mixed>>>|null */
    private function exactTeamBalance(array $players, array $capacities, bool $balanceStats): ?array
    {
        usort($players, static fn (array $a, array $b): int => abs((float) $b['statsScore']) <=> abs((float) $a['statsScore']));
        $teams = $this->emptyTeamBuckets($capacities);
        $bestTeams = null;
        $bestObjective = null;
        $equivalentSolutions = 0;

        $search = function (int $playerIndex) use (
            &$search,
            &$teams,
            &$bestTeams,
            &$bestObjective,
            &$equivalentSolutions,
            $players,
            $balanceStats,
        ): void {
            if ($playerIndex === count($players)) {
                $objective = $this->teamObjective($teams, $balanceStats);
                if ($this->objectiveIsBetter($objective, $bestObjective)) {
                    $bestObjective = $objective;
                    $bestTeams = $teams;
                    $equivalentSolutions = 1;
                } elseif ($this->objectivesAreEqual($objective, $bestObjective)) {
                    $equivalentSolutions++;
                    if (mt_rand(1, $equivalentSolutions) === 1) {
                        $bestTeams = $teams;
                    }
                }

                return;
            }

            $player = $players[$playerIndex];
            $seenStates = [];
            foreach ($teams as $teamIndex => $team) {
                if (count($team['players']) >= $team['capacity']) {
                    continue;
                }

                $state = implode('|', [
                    $team['capacity'],
                    count($team['players']),
                    sprintf('%.9F', $team['score']),
                    $team['cardio'],
                ]);
                if (isset($seenStates[$state])) {
                    continue;
                }
                $seenStates[$state] = true;

                $teams[$teamIndex]['players'][] = $player;
                $teams[$teamIndex]['score'] += (float) $player['statsScore'];
                $teams[$teamIndex]['cardio'] += (bool) ($player['has_cardio'] ?? false) ? 1 : 0;
                $search($playerIndex + 1);
                array_pop($teams[$teamIndex]['players']);
                $teams[$teamIndex]['score'] -= (float) $player['statsScore'];
                $teams[$teamIndex]['cardio'] -= (bool) ($player['has_cardio'] ?? false) ? 1 : 0;
            }
        };

        $search(0);

        return $bestTeams === null ? null : $this->playersFromBuckets($bestTeams);
    }

    /** @return list<list<array<string, mixed>>> */
    private function heuristicTeamBalance(array $players, array $capacities, bool $balanceStats): array
    {
        $bestTeams = null;
        $bestObjective = null;
        $attempts = min(48, max(12, count($players) * 2));

        for ($attempt = 0; $attempt < $attempts; $attempt++) {
            $orderedPlayers = $players;
            if ($attempt === 0) {
                usort($orderedPlayers, static fn (array $a, array $b): int => abs((float) $b['statsScore']) <=> abs((float) $a['statsScore']));
            } else {
                shuffle($orderedPlayers);
            }

            $teams = $this->emptyTeamBuckets($capacities);
            foreach ($orderedPlayers as $player) {
                $candidateIndex = null;
                $candidateObjective = null;

                foreach ($teams as $teamIndex => $team) {
                    if (count($team['players']) >= $team['capacity']) {
                        continue;
                    }

                    $candidateTeams = $teams;
                    $candidateTeams[$teamIndex]['players'][] = $player;
                    $candidateTeams[$teamIndex]['score'] += (float) $player['statsScore'];
                    $candidateTeams[$teamIndex]['cardio'] += (bool) ($player['has_cardio'] ?? false) ? 1 : 0;
                    $objective = array_merge(
                        $this->teamObjective($candidateTeams, $balanceStats),
                        [$this->occupancySpread($candidateTeams)],
                    );

                    if ($this->objectiveIsBetter($objective, $candidateObjective)) {
                        $candidateIndex = $teamIndex;
                        $candidateObjective = $objective;
                    }
                }

                if ($candidateIndex === null) {
                    continue;
                }
                $teams[$candidateIndex]['players'][] = $player;
                $teams[$candidateIndex]['score'] += (float) $player['statsScore'];
                $teams[$candidateIndex]['cardio'] += (bool) ($player['has_cardio'] ?? false) ? 1 : 0;
            }

            $teams = $this->improveTeamsBySwapping($teams, $balanceStats);
            $objective = $this->teamObjective($teams, $balanceStats);
            if ($this->objectiveIsBetter($objective, $bestObjective)
                || ($this->objectivesAreEqual($objective, $bestObjective) && mt_rand(0, 1) === 1)) {
                $bestTeams = $teams;
                $bestObjective = $objective;
            }
        }

        return $this->playersFromBuckets($bestTeams ?? $this->emptyTeamBuckets($capacities));
    }

    private function improveTeamsBySwapping(array $teams, bool $balanceStats): array
    {
        for ($iteration = 0; $iteration < 100; $iteration++) {
            $currentObjective = $this->teamObjective($teams, $balanceStats);
            $bestObjective = $currentObjective;
            $bestSwap = null;

            for ($firstTeam = 0; $firstTeam < count($teams) - 1; $firstTeam++) {
                for ($secondTeam = $firstTeam + 1; $secondTeam < count($teams); $secondTeam++) {
                    foreach ($teams[$firstTeam]['players'] as $firstIndex => $firstPlayer) {
                        foreach ($teams[$secondTeam]['players'] as $secondIndex => $secondPlayer) {
                            $candidate = $teams;
                            $candidate[$firstTeam]['players'][$firstIndex] = $secondPlayer;
                            $candidate[$secondTeam]['players'][$secondIndex] = $firstPlayer;
                            $this->refreshTeamBucket($candidate[$firstTeam]);
                            $this->refreshTeamBucket($candidate[$secondTeam]);
                            $objective = $this->teamObjective($candidate, $balanceStats);

                            if ($this->objectiveIsBetter($objective, $bestObjective)) {
                                $bestObjective = $objective;
                                $bestSwap = [$firstTeam, $firstIndex, $secondTeam, $secondIndex];
                            }
                        }
                    }
                }
            }

            if ($bestSwap === null) {
                break;
            }

            [$firstTeam, $firstIndex, $secondTeam, $secondIndex] = $bestSwap;
            [$teams[$firstTeam]['players'][$firstIndex], $teams[$secondTeam]['players'][$secondIndex]] = [
                $teams[$secondTeam]['players'][$secondIndex],
                $teams[$firstTeam]['players'][$firstIndex],
            ];
            $this->refreshTeamBucket($teams[$firstTeam]);
            $this->refreshTeamBucket($teams[$secondTeam]);
        }

        return $teams;
    }

    private function emptyTeamBuckets(array $capacities): array
    {
        return array_map(static fn (int $capacity): array => [
            'capacity' => $capacity,
            'cardio' => 0,
            'score' => 0.0,
            'players' => [],
        ], $capacities);
    }

    private function refreshTeamBucket(array &$team): void
    {
        $team['score'] = array_sum(array_column($team['players'], 'statsScore'));
        $team['cardio'] = count(array_filter(
            $team['players'],
            static fn (array $player): bool => (bool) ($player['has_cardio'] ?? false),
        ));
    }

    private function teamObjective(array $teams, bool $balanceStats): array
    {
        $scores = array_column($teams, 'score');
        $cardio = array_column($teams, 'cardio');
        $scoreAverage = array_sum($scores) / count($scores);
        $cardioAverage = array_sum($cardio) / count($cardio);
        $scoreMetrics = [
            max($scores) - min($scores),
            array_sum(array_map(static fn (float $score): float => ($score - $scoreAverage) ** 2, $scores)),
        ];
        $cardioMetrics = [
            max($cardio) - min($cardio),
            array_sum(array_map(static fn (int $count): float => ($count - $cardioAverage) ** 2, $cardio)),
        ];

        return $balanceStats ? array_merge($scoreMetrics, $cardioMetrics) : $cardioMetrics;
    }

    private function occupancySpread(array $teams): float
    {
        $occupancy = array_map(
            static fn (array $team): float => count($team['players']) / $team['capacity'],
            $teams,
        );

        return max($occupancy) - min($occupancy);
    }

    private function objectiveIsBetter(array $candidate, ?array $current): bool
    {
        if ($current === null) {
            return true;
        }

        foreach ($candidate as $index => $value) {
            $difference = (float) $value - (float) $current[$index];
            if (abs($difference) <= 0.000000001) {
                continue;
            }

            return $difference < 0;
        }

        return false;
    }

    private function objectivesAreEqual(array $left, ?array $right): bool
    {
        if ($right === null || count($left) !== count($right)) {
            return false;
        }

        foreach ($left as $index => $value) {
            if (abs((float) $value - (float) $right[$index]) > 0.000000001) {
                return false;
            }
        }

        return true;
    }

    /** @return list<list<array<string, mixed>>> */
    private function playersFromBuckets(array $teams): array
    {
        return array_values(array_map(static fn (array $team): array => array_values($team['players']), $teams));
    }

    /** @return array<string, array<string, mixed>> */
    private function formMetrics(array $players, array $matches): array
    {
        $ratings = array_fill_keys(array_column($players, 'id'), self::INITIAL_ELO);
        $impacts = [];

        foreach (array_reverse($matches) as $match) {
            $teamPlayers = ['A' => [], 'B' => []];
            foreach ($match['participants'] ?? [] as $participant) {
                $team = $participant['team'] ?? null;
                $playerId = (string) ($participant['player_id'] ?? '');
                if (isset($teamPlayers[$team])) {
                    $teamPlayers[$team][$playerId] = true;
                }
                $ratings[$playerId] ??= self::INITIAL_ELO;
            }

            $averageA = $this->teamAverage(array_keys($teamPlayers['A']), $ratings);
            $averageB = $this->teamAverage(array_keys($teamPlayers['B']), $ratings);
            $expectedA = 1 / (1 + 10 ** (($averageB - $averageA) / 400));
            $expectedB = 1 / (1 + 10 ** (($averageA - $averageB) / 400));
            [$scoreA, $scoreB] = $this->eloScores($match);
            $teamDeltas = [
                'A' => self::ELO_K * ($scoreA - $expectedA),
                'B' => self::ELO_K * ($scoreB - $expectedB),
            ];

            foreach (array_unique(array_merge(array_keys($teamPlayers['A']), array_keys($teamPlayers['B']))) as $playerId) {
                $teams = [];
                foreach ($match['participants'] ?? [] as $participant) {
                    if (($participant['player_id'] ?? null) === $playerId) {
                        $teams[(string) $participant['team']] = true;
                    }
                }
                $playerTeam = count($teams) === 1 ? array_key_first($teams) : null;
                $goals = 0;
                $ownGoals = 0;
                foreach ($match['goals'] ?? [] as $goal) {
                    if (($goal['player_id'] ?? null) !== $playerId) {
                        continue;
                    }
                    if ($goal['is_own_goal'] ?? false) {
                        $ownGoals += (int) ($goal['count'] ?? 0);
                    } else {
                        $goals += (int) ($goal['count'] ?? 0);
                    }
                }
                $impact = ($playerTeam === null ? 0 : $teamDeltas[$playerTeam]) + $goals * 2 - $ownGoals * 3;
                $winner = $this->winner($match);
                $result = $playerTeam === null || $winner === null ? 'draw' : ($playerTeam === $winner ? 'win' : 'loss');
                $ratings[$playerId] = ($ratings[$playerId] ?? self::INITIAL_ELO) + $impact;
                $impacts[(string) $match['id']][$playerId] = compact('goals', 'ownGoals', 'impact', 'result');
            }
        }

        $recent = array_slice($matches, 0, count(self::FORM_WEIGHTS));
        $required = min(2, count($recent));
        $metrics = [];
        foreach ($players as $player) {
            $playerId = (string) $player['id'];
            $values = [
                'formDraws' => 0,
                'formGoals' => 0,
                'formLosses' => 0,
                'formMatches' => 0,
                'formOwnGoals' => 0,
                'formScore' => 0.0,
                'formWins' => 0,
                'latestFormImpact' => 0.0,
            ];

            foreach ($recent as $index => $match) {
                $performance = $impacts[(string) $match['id']][$playerId] ?? null;
                if (! is_array($performance)) {
                    continue;
                }
                if ($index === 0) {
                    $values['latestFormImpact'] = $performance['impact'];
                }
                $values['formScore'] += $performance['impact'] * self::FORM_WEIGHTS[$index];
                $values['formMatches']++;
                $values['formGoals'] += $performance['goals'];
                $values['formOwnGoals'] += $performance['ownGoals'];
                $resultKey = match ($performance['result']) {
                    'win' => 'formWins',
                    'loss' => 'formLosses',
                    default => 'formDraws',
                };
                $values[$resultKey]++;
            }

            $eloRating = $ratings[$playerId] ?? self::INITIAL_ELO;
            $metrics[$playerId] = array_merge($values, [
                'eloRating' => $eloRating,
                'historicalScore' => $eloRating - self::INITIAL_ELO,
                'isFormEligible' => $values['formMatches'] > 0 && $values['formMatches'] >= $required,
            ]);
        }

        return $metrics;
    }

    private function teamAverage(array $playerIds, array $ratings): float
    {
        if ($playerIds === []) {
            return self::INITIAL_ELO;
        }

        return array_sum(array_map(static fn (string $id): float => (float) ($ratings[$id] ?? self::INITIAL_ELO), $playerIds)) / count($playerIds);
    }

    /** @return array{float, float} */
    private function eloScores(array $match): array
    {
        $scoreA = (int) $match['teamAScore'];
        $scoreB = (int) $match['teamBScore'];
        if ($scoreA > $scoreB) {
            return [1.0, 0.0];
        }
        if ($scoreB > $scoreA) {
            return [0.0, 1.0];
        }
        if ($match['teamAPenaltyScore'] !== null && $match['teamBPenaltyScore'] !== null
            && $match['teamAPenaltyScore'] !== $match['teamBPenaltyScore']) {
            return $match['teamAPenaltyScore'] > $match['teamBPenaltyScore'] ? [0.75, 0.25] : [0.25, 0.75];
        }

        return [0.5, 0.5];
    }

    private function compare(int|float|null $left, int|float|null $right): int
    {
        return ($left ?? 0) <=> ($right ?? 0);
    }

    private function any(array $items, callable $callback): bool
    {
        return $this->first($items, $callback) !== null;
    }

    private function first(array $items, callable $callback): mixed
    {
        foreach ($items as $item) {
            if ($callback($item)) {
                return $item;
            }
        }

        return null;
    }
}
