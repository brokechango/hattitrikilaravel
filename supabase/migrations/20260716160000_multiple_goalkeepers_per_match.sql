-- A goal is attributed to the goalkeeper who received it. A side may use
-- more than one goalkeeper during a match, so allow several marked players.

create or replace function public.create_friendly_match_acta(
    p_match_date date,
    p_team_a_score integer,
    p_team_b_score integer,
    p_players jsonb,
    p_goals jsonb
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
    v_match_id uuid;
    v_player jsonb;
    v_goal jsonb;
begin
    if not exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin') then
        raise exception 'Administrator permission required' using errcode = '42501';
    end if;
    if p_match_date is null or p_team_a_score < 0 or p_team_b_score < 0 then raise exception 'Invalid match data'; end if;
    if p_players is null or jsonb_array_length(p_players) = 0 then raise exception 'A match needs players'; end if;
    if (select count(*) from jsonb_array_elements(p_players) player where player.value ->> 'team' = 'A') = 0
       or (select count(*) from jsonb_array_elements(p_players) player where player.value ->> 'team' = 'B') = 0
       or (select count(*) from jsonb_array_elements(p_players) player where player.value ->> 'team' = 'A' and coalesce((player.value ->> 'was_goalkeeper')::boolean, false)) = 0
       or (select count(*) from jsonb_array_elements(p_players) player where player.value ->> 'team' = 'B' and coalesce((player.value ->> 'was_goalkeeper')::boolean, false)) = 0 then
        raise exception 'Each team needs at least one goalkeeper';
    end if;
    if coalesce((select sum((goal.value ->> 'count')::integer) from jsonb_array_elements(coalesce(p_goals, '[]'::jsonb)) goal where goal.value ->> 'team' = 'A'), 0) <> p_team_a_score
       or coalesce((select sum((goal.value ->> 'count')::integer) from jsonb_array_elements(coalesce(p_goals, '[]'::jsonb)) goal where goal.value ->> 'team' = 'B'), 0) <> p_team_b_score then
        raise exception 'Goal totals must match the score';
    end if;

    insert into public.friendly_matches (played_on, team_a_score, team_b_score)
    values (p_match_date, p_team_a_score, p_team_b_score)
    returning id into v_match_id;
    for v_player in select value from jsonb_array_elements(p_players) loop
        if (v_player ->> 'team') not in ('A', 'B') then raise exception 'Invalid player team'; end if;
        insert into public.match_players (match_id, player_id, team, was_goalkeeper)
        values (v_match_id, (v_player ->> 'player_id')::uuid, v_player ->> 'team', coalesce((v_player ->> 'was_goalkeeper')::boolean, false));
    end loop;
    for v_goal in select value from jsonb_array_elements(coalesce(p_goals, '[]'::jsonb)) loop
        if (v_goal ->> 'team') not in ('A', 'B') or (v_goal ->> 'count')::integer <= 0 then raise exception 'Invalid goal'; end if;
        if not exists (select 1 from jsonb_array_elements(p_players) player where player.value ->> 'player_id' = v_goal ->> 'player_id' and player.value ->> 'team' = v_goal ->> 'team') then
            raise exception 'Goal scorer is not in the selected team';
        end if;
        if not exists (select 1 from jsonb_array_elements(p_players) player where player.value ->> 'player_id' = v_goal ->> 'goalkeeper_id' and player.value ->> 'team' <> v_goal ->> 'team' and coalesce((player.value ->> 'was_goalkeeper')::boolean, false)) then
            raise exception 'Goalkeeper does not match the opposing team';
        end if;
        insert into public.goals (match_id, scorer_player_id, team, goal_count, goalkeeper_player_id)
        values (v_match_id, (v_goal ->> 'player_id')::uuid, v_goal ->> 'team', (v_goal ->> 'count')::integer, (v_goal ->> 'goalkeeper_id')::uuid);
    end loop;
    return v_match_id;
end;
$$;

create or replace function public.update_friendly_match_acta(
    p_match_id uuid,
    p_match_date date,
    p_team_a_score integer,
    p_team_b_score integer,
    p_players jsonb,
    p_goals jsonb
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
    v_player jsonb;
    v_goal jsonb;
begin
    if not exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin') then
        raise exception 'Administrator permission required' using errcode = '42501';
    end if;
    if p_match_date is null or p_team_a_score < 0 or p_team_b_score < 0 then raise exception 'Invalid match data'; end if;
    if p_players is null or jsonb_array_length(p_players) = 0 then raise exception 'A match needs players'; end if;
    if not exists (select 1 from public.friendly_matches where id = p_match_id) then raise exception 'Match not found'; end if;
    if (select count(*) from jsonb_array_elements(p_players) player where player.value ->> 'team' = 'A') = 0
       or (select count(*) from jsonb_array_elements(p_players) player where player.value ->> 'team' = 'B') = 0
       or (select count(*) from jsonb_array_elements(p_players) player where player.value ->> 'team' = 'A' and coalesce((player.value ->> 'was_goalkeeper')::boolean, false)) = 0
       or (select count(*) from jsonb_array_elements(p_players) player where player.value ->> 'team' = 'B' and coalesce((player.value ->> 'was_goalkeeper')::boolean, false)) = 0 then
        raise exception 'Each team needs at least one goalkeeper';
    end if;
    if coalesce((select sum((goal.value ->> 'count')::integer) from jsonb_array_elements(coalesce(p_goals, '[]'::jsonb)) goal where goal.value ->> 'team' = 'A'), 0) <> p_team_a_score
       or coalesce((select sum((goal.value ->> 'count')::integer) from jsonb_array_elements(coalesce(p_goals, '[]'::jsonb)) goal where goal.value ->> 'team' = 'B'), 0) <> p_team_b_score then
        raise exception 'Goal totals must match the score';
    end if;

    update public.friendly_matches set played_on = p_match_date, team_a_score = p_team_a_score, team_b_score = p_team_b_score where id = p_match_id;
    delete from public.goals where match_id = p_match_id;
    delete from public.match_players where match_id = p_match_id;
    for v_player in select value from jsonb_array_elements(p_players) loop
        insert into public.match_players (match_id, player_id, team, was_goalkeeper)
        values (p_match_id, (v_player ->> 'player_id')::uuid, v_player ->> 'team', coalesce((v_player ->> 'was_goalkeeper')::boolean, false));
    end loop;
    for v_goal in select value from jsonb_array_elements(coalesce(p_goals, '[]'::jsonb)) loop
        if (v_goal ->> 'team') not in ('A', 'B') or (v_goal ->> 'count')::integer <= 0 then raise exception 'Invalid goal'; end if;
        if not exists (select 1 from jsonb_array_elements(p_players) player where player.value ->> 'player_id' = v_goal ->> 'player_id' and player.value ->> 'team' = v_goal ->> 'team') then
            raise exception 'Goal scorer is not in the selected team';
        end if;
        if not exists (select 1 from jsonb_array_elements(p_players) player where player.value ->> 'player_id' = v_goal ->> 'goalkeeper_id' and player.value ->> 'team' <> v_goal ->> 'team' and coalesce((player.value ->> 'was_goalkeeper')::boolean, false)) then
            raise exception 'Goalkeeper does not match the opposing team';
        end if;
        insert into public.goals (match_id, scorer_player_id, team, goal_count, goalkeeper_player_id)
        values (p_match_id, (v_goal ->> 'player_id')::uuid, v_goal ->> 'team', (v_goal ->> 'count')::integer, (v_goal ->> 'goalkeeper_id')::uuid);
    end loop;
    return p_match_id;
end;
$$;

grant execute on function public.create_friendly_match_acta(date, integer, integer, jsonb, jsonb) to authenticated;
grant execute on function public.update_friendly_match_acta(uuid, date, integer, integer, jsonb, jsonb) to authenticated;
