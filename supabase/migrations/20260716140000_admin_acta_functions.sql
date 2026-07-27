-- Uses the existing schema: players, friendly_matches, match_players and goals.
-- The functions run atomically and authorise the caller through public.profiles.

create or replace function public.get_active_players()
returns table (
    id uuid,
    name text,
    is_active boolean,
    created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
    if not exists (
        select 1 from public.profiles
        where profiles.id = auth.uid() and profiles.role = 'admin'
    ) then
        raise exception 'Administrator permission required' using errcode = '42501';
    end if;

    return query
    select players.id, players.name, players.is_active, players.created_at
    from public.players
    where players.is_active = true
    order by lower(players.name);
end;
$$;

create or replace function public.create_active_player(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_player_id uuid;
begin
    if not exists (
        select 1 from public.profiles
        where profiles.id = auth.uid() and profiles.role = 'admin'
    ) then
        raise exception 'Administrator permission required' using errcode = '42501';
    end if;

    if char_length(trim(coalesce(p_name, ''))) = 0 then
        raise exception 'Player name is required';
    end if;

    insert into public.players (name, is_active)
    values (trim(p_name), true)
    returning id into v_player_id;

    return v_player_id;
end;
$$;

create or replace function public.create_friendly_match_acta(
    p_match_date date,
    p_team_a_score integer,
    p_team_b_score integer,
    p_players jsonb,
    p_goals jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_match_id uuid;
    v_player jsonb;
    v_goal jsonb;
begin
    if not exists (
        select 1 from public.profiles
        where profiles.id = auth.uid() and profiles.role = 'admin'
    ) then
        raise exception 'Administrator permission required' using errcode = '42501';
    end if;

    if p_match_date is null or p_team_a_score < 0 or p_team_b_score < 0 then
        raise exception 'Invalid match data';
    end if;

    if p_players is null or jsonb_array_length(p_players) = 0 then
        raise exception 'A match needs players';
    end if;

    if (select count(*) from jsonb_array_elements(p_players) as player where player.value ->> 'team' = 'A') = 0
       or (select count(*) from jsonb_array_elements(p_players) as player where player.value ->> 'team' = 'B') = 0
       or (select count(*) from jsonb_array_elements(p_players) as player
           where player.value ->> 'team' = 'A' and coalesce((player.value ->> 'was_goalkeeper')::boolean, false)) <> 1
       or (select count(*) from jsonb_array_elements(p_players) as player
           where player.value ->> 'team' = 'B' and coalesce((player.value ->> 'was_goalkeeper')::boolean, false)) <> 1 then
        raise exception 'Each team needs exactly one goalkeeper';
    end if;

    if coalesce((select sum((goal.value ->> 'count')::integer)
        from jsonb_array_elements(coalesce(p_goals, '[]'::jsonb)) as goal
        where goal.value ->> 'team' = 'A'), 0) <> p_team_a_score
       or coalesce((select sum((goal.value ->> 'count')::integer)
        from jsonb_array_elements(coalesce(p_goals, '[]'::jsonb)) as goal
        where goal.value ->> 'team' = 'B'), 0) <> p_team_b_score then
        raise exception 'Goal totals must match the score';
    end if;

    insert into public.friendly_matches (played_on, team_a_score, team_b_score)
    values (p_match_date, p_team_a_score, p_team_b_score)
    returning id into v_match_id;

    for v_player in select value from jsonb_array_elements(p_players)
    loop
        if (v_player ->> 'team') not in ('A', 'B') then
            raise exception 'Invalid player team';
        end if;
        insert into public.match_players (match_id, player_id, team, was_goalkeeper)
        values (
            v_match_id,
            (v_player ->> 'player_id')::uuid,
            v_player ->> 'team',
            coalesce((v_player ->> 'was_goalkeeper')::boolean, false)
        );
    end loop;

    for v_goal in select value from jsonb_array_elements(coalesce(p_goals, '[]'::jsonb))
    loop
        if (v_goal ->> 'team') not in ('A', 'B') or (v_goal ->> 'count')::integer <= 0 then
            raise exception 'Invalid goal';
        end if;
        if not exists (
            select 1 from jsonb_array_elements(p_players) as player
            where player.value ->> 'player_id' = v_goal ->> 'player_id'
              and player.value ->> 'team' = v_goal ->> 'team'
        ) then
            raise exception 'Goal scorer is not in the selected team';
        end if;
        if not exists (
            select 1 from jsonb_array_elements(p_players) as player
            where player.value ->> 'player_id' = v_goal ->> 'goalkeeper_id'
              and player.value ->> 'team' <> v_goal ->> 'team'
              and coalesce((player.value ->> 'was_goalkeeper')::boolean, false)
        ) then
            raise exception 'Goalkeeper does not match the opposing team';
        end if;
        insert into public.goals (match_id, scorer_player_id, team, goal_count, goalkeeper_player_id)
        values (
            v_match_id,
            (v_goal ->> 'player_id')::uuid,
            v_goal ->> 'team',
            (v_goal ->> 'count')::integer,
            (v_goal ->> 'goalkeeper_id')::uuid
        );
    end loop;

    return v_match_id;
end;
$$;

grant execute on function public.get_active_players() to authenticated;
grant execute on function public.create_active_player(text) to authenticated;
grant execute on function public.create_friendly_match_acta(date, integer, integer, jsonb, jsonb) to authenticated;
