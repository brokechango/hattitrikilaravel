-- Public read model consumed by Home, Partidos, Clasificaciones and the match detail.
-- It intentionally exposes only league results and player names, never profiles or
-- administrator-only management data. SECURITY DEFINER keeps this read model stable
-- even when the base tables have RLS enabled.

drop function if exists public.get_public_league_players();
create function public.get_public_league_players()
returns table (
    id uuid,
    name text,
    is_active boolean
)
language sql security definer set search_path = public as $$
    select p.id, p.name, p.is_active
    from public.players p
    order by lower(p.name);
$$;

drop function if exists public.get_public_friendly_matches();
create function public.get_public_friendly_matches()
returns table (
    id uuid,
    played_on date,
    team_a_score integer,
    team_b_score integer,
    team_a_penalty_score integer,
    team_b_penalty_score integer,
    participants jsonb,
    goals jsonb
)
language sql security definer set search_path = public as $$
    select
        m.id,
        m.played_on,
        m.team_a_score,
        m.team_b_score,
        m.team_a_penalty_score,
        m.team_b_penalty_score,
        coalesce((
            select jsonb_agg(
                jsonb_build_object(
                    'player_id', mp.player_id,
                    'team', mp.team,
                    'was_goalkeeper', mp.was_goalkeeper
                )
                order by mp.player_id
            )
            from public.match_players mp
            where mp.match_id = m.id
        ), '[]'::jsonb),
        coalesce((
            select jsonb_agg(
                jsonb_build_object(
                    'player_id', g.scorer_player_id,
                    'team', g.team,
                    'count', g.goal_count,
                    'goalkeeper_id', g.goalkeeper_player_id,
                    'is_own_goal', g.is_own_goal
                )
                order by g.scorer_player_id
            )
            from public.goals g
            where g.match_id = m.id
        ), '[]'::jsonb)
    from public.friendly_matches m
    order by m.played_on desc;
$$;

grant execute on function public.get_public_league_players() to anon, authenticated;
grant execute on function public.get_public_friendly_matches() to anon, authenticated;
