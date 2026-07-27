-- Goals belong to a scorer and a team, but no longer to a specific opposing
-- goalkeeper. Goalkeeper statistics are derived from the score and shared
-- evenly when a team used more than one goalkeeper.
alter table public.goals
    alter column goalkeeper_player_id drop not null;

create or replace function public.validate_friendly_match_acta(
    p_team_a_score integer,
    p_team_b_score integer,
    p_players jsonb,
    p_goals jsonb
)
returns void
language plpgsql security definer set search_path = '' as $$
declare
    v_goal jsonb;
    v_is_own_goal boolean;
begin
    if not exists (
        select 1
        from public.profiles
        where profiles.id = auth.uid()
          and profiles.role = 'admin'
    ) then
        raise exception 'Administrator permission required' using errcode = '42501';
    end if;

    if p_team_a_score < 0
       or p_team_b_score < 0
       or p_players is null
       or jsonb_array_length(p_players) = 0 then
        raise exception 'Invalid match data';
    end if;

    if (select count(*) from jsonb_array_elements(p_players) player where player.value ->> 'team' = 'A') = 0
       or (select count(*) from jsonb_array_elements(p_players) player where player.value ->> 'team' = 'B') = 0
       or (select count(*) from jsonb_array_elements(p_players) player where player.value ->> 'team' = 'A' and coalesce((player.value ->> 'was_goalkeeper')::boolean, false)) = 0
       or (select count(*) from jsonb_array_elements(p_players) player where player.value ->> 'team' = 'B' and coalesce((player.value ->> 'was_goalkeeper')::boolean, false)) = 0 then
        raise exception 'Each team needs at least one goalkeeper';
    end if;

    if coalesce((
        select sum((goal.value ->> 'count')::integer)
        from jsonb_array_elements(coalesce(p_goals, '[]'::jsonb)) goal
        where goal.value ->> 'team' = 'A'
    ), 0) <> p_team_a_score
       or coalesce((
           select sum((goal.value ->> 'count')::integer)
           from jsonb_array_elements(coalesce(p_goals, '[]'::jsonb)) goal
           where goal.value ->> 'team' = 'B'
       ), 0) <> p_team_b_score then
        raise exception 'Goal totals must match the score';
    end if;

    for v_goal in
        select value
        from jsonb_array_elements(coalesce(p_goals, '[]'::jsonb))
    loop
        v_is_own_goal := coalesce((v_goal ->> 'is_own_goal')::boolean, false);

        if (v_goal ->> 'team') not in ('A', 'B')
           or (v_goal ->> 'count')::integer <= 0 then
            raise exception 'Invalid goal';
        end if;

        if not exists (
            select 1
            from jsonb_array_elements(p_players) player
            where player.value ->> 'player_id' = v_goal ->> 'player_id'
              and (
                  (not v_is_own_goal and player.value ->> 'team' = v_goal ->> 'team')
                  or (v_is_own_goal and player.value ->> 'team' <> v_goal ->> 'team')
              )
        ) then
            raise exception 'Goal scorer does not match the goal';
        end if;
    end loop;
end;
$$;

create or replace function public.create_friendly_match_acta(
    p_match_date date,
    p_team_a_score integer,
    p_team_b_score integer,
    p_team_a_penalty_score integer,
    p_team_b_penalty_score integer,
    p_players jsonb,
    p_goals jsonb
)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
    v_match_id uuid;
    v_player jsonb;
    v_goal jsonb;
begin
    if p_match_date is null then
        raise exception 'Invalid match data';
    end if;

    perform public.validate_friendly_match_acta(
        p_team_a_score,
        p_team_b_score,
        p_players,
        p_goals
    );
    perform public.validate_penalty_shootout(
        p_team_a_score,
        p_team_b_score,
        p_team_a_penalty_score,
        p_team_b_penalty_score
    );

    insert into public.friendly_matches (
        played_on,
        team_a_score,
        team_b_score,
        team_a_penalty_score,
        team_b_penalty_score
    )
    values (
        p_match_date,
        p_team_a_score,
        p_team_b_score,
        p_team_a_penalty_score,
        p_team_b_penalty_score
    )
    returning id into v_match_id;

    for v_player in
        select value from jsonb_array_elements(p_players)
    loop
        insert into public.match_players (match_id, player_id, team, was_goalkeeper)
        values (
            v_match_id,
            (v_player ->> 'player_id')::uuid,
            (v_player ->> 'team')::public.team_side,
            coalesce((v_player ->> 'was_goalkeeper')::boolean, false)
        );
    end loop;

    for v_goal in
        select value from jsonb_array_elements(coalesce(p_goals, '[]'::jsonb))
    loop
        insert into public.goals (
            match_id,
            scorer_player_id,
            team,
            goal_count,
            is_own_goal
        )
        values (
            v_match_id,
            (v_goal ->> 'player_id')::uuid,
            (v_goal ->> 'team')::public.team_side,
            (v_goal ->> 'count')::integer,
            coalesce((v_goal ->> 'is_own_goal')::boolean, false)
        );
    end loop;

    return v_match_id;
end;
$$;

create or replace function public.update_friendly_match_acta(
    p_match_id uuid,
    p_match_date date,
    p_team_a_score integer,
    p_team_b_score integer,
    p_team_a_penalty_score integer,
    p_team_b_penalty_score integer,
    p_players jsonb,
    p_goals jsonb
)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
    v_player jsonb;
    v_goal jsonb;
begin
    if p_match_date is null
       or not exists (
           select 1 from public.friendly_matches where id = p_match_id
       ) then
        raise exception 'Match not found';
    end if;

    perform public.validate_friendly_match_acta(
        p_team_a_score,
        p_team_b_score,
        p_players,
        p_goals
    );
    perform public.validate_penalty_shootout(
        p_team_a_score,
        p_team_b_score,
        p_team_a_penalty_score,
        p_team_b_penalty_score
    );

    update public.friendly_matches
    set played_on = p_match_date,
        team_a_score = p_team_a_score,
        team_b_score = p_team_b_score,
        team_a_penalty_score = p_team_a_penalty_score,
        team_b_penalty_score = p_team_b_penalty_score
    where id = p_match_id;

    delete from public.goals where match_id = p_match_id;
    delete from public.match_players where match_id = p_match_id;

    for v_player in
        select value from jsonb_array_elements(p_players)
    loop
        insert into public.match_players (match_id, player_id, team, was_goalkeeper)
        values (
            p_match_id,
            (v_player ->> 'player_id')::uuid,
            (v_player ->> 'team')::public.team_side,
            coalesce((v_player ->> 'was_goalkeeper')::boolean, false)
        );
    end loop;

    for v_goal in
        select value from jsonb_array_elements(coalesce(p_goals, '[]'::jsonb))
    loop
        insert into public.goals (
            match_id,
            scorer_player_id,
            team,
            goal_count,
            is_own_goal
        )
        values (
            p_match_id,
            (v_goal ->> 'player_id')::uuid,
            (v_goal ->> 'team')::public.team_side,
            (v_goal ->> 'count')::integer,
            coalesce((v_goal ->> 'is_own_goal')::boolean, false)
        );
    end loop;

    return p_match_id;
end;
$$;

revoke execute on function public.validate_friendly_match_acta(
    integer,
    integer,
    jsonb,
    jsonb
) from public, anon, authenticated;

revoke execute on function public.create_friendly_match_acta(
    date,
    integer,
    integer,
    integer,
    integer,
    jsonb,
    jsonb
) from public, anon;

grant execute on function public.create_friendly_match_acta(
    date,
    integer,
    integer,
    integer,
    integer,
    jsonb,
    jsonb
) to authenticated;

revoke execute on function public.update_friendly_match_acta(
    uuid,
    date,
    integer,
    integer,
    integer,
    integer,
    jsonb,
    jsonb
) from public, anon;

grant execute on function public.update_friendly_match_acta(
    uuid,
    date,
    integer,
    integer,
    integer,
    integer,
    jsonb,
    jsonb
) to authenticated;

notify pgrst, 'reload schema';
