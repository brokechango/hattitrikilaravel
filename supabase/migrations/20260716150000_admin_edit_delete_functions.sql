-- CRUD administration functions for Zona Mister. Every write is still
-- authorised inside PostgreSQL; the client-side session guard is only UX.

create or replace function public.get_admin_players()
returns table (id uuid, name text, is_active boolean)
language plpgsql security definer set search_path = public as $$
begin
    if not exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin') then
        raise exception 'Administrator permission required' using errcode = '42501';
    end if;

    return query
    select players.id, players.name, players.is_active
    from public.players
    order by players.is_active desc, lower(players.name);
end;
$$;

create or replace function public.update_active_player(p_player_id uuid, p_name text)
returns uuid
language plpgsql security definer set search_path = public as $$
begin
    if not exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin') then
        raise exception 'Administrator permission required' using errcode = '42501';
    end if;
    if char_length(trim(coalesce(p_name, ''))) = 0 then
        raise exception 'Player name is required';
    end if;

    update public.players set name = trim(p_name) where id = p_player_id;
    if not found then raise exception 'Player not found'; end if;
    return p_player_id;
end;
$$;

create or replace function public.delete_player(p_player_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
    if not exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin') then
        raise exception 'Administrator permission required' using errcode = '42501';
    end if;
    if exists (select 1 from public.match_players where player_id = p_player_id) then
        raise exception 'Player has match history';
    end if;

    delete from public.players where id = p_player_id;
    if not found then raise exception 'Player not found'; end if;
end;
$$;

create or replace function public.get_admin_friendly_matches()
returns table (id uuid, played_on date, team_a_score integer, team_b_score integer)
language plpgsql security definer set search_path = public as $$
begin
    if not exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin') then
        raise exception 'Administrator permission required' using errcode = '42501';
    end if;

    return query
    select friendly_matches.id, friendly_matches.played_on, friendly_matches.team_a_score, friendly_matches.team_b_score
    from public.friendly_matches
    order by friendly_matches.played_on desc;
end;
$$;

create or replace function public.get_friendly_match_acta(p_match_id uuid)
returns table (match_date date, team_a_score integer, team_b_score integer, participants jsonb, goals jsonb)
language plpgsql security definer set search_path = public as $$
begin
    if not exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin') then
        raise exception 'Administrator permission required' using errcode = '42501';
    end if;

    return query
    select
        m.played_on,
        m.team_a_score,
        m.team_b_score,
        coalesce((
            select jsonb_agg(jsonb_build_object(
                'player_id', mp.player_id, 'team', mp.team, 'was_goalkeeper', mp.was_goalkeeper
            ) order by mp.player_id)
            from public.match_players mp where mp.match_id = m.id
        ), '[]'::jsonb),
        coalesce((
            select jsonb_agg(jsonb_build_object(
                'player_id', g.scorer_player_id, 'team', g.team, 'count', g.goal_count,
                'goalkeeper_id', g.goalkeeper_player_id
            ))
            from public.goals g where g.match_id = m.id
        ), '[]'::jsonb)
    from public.friendly_matches m
    where m.id = p_match_id;
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
       or (select count(*) from jsonb_array_elements(p_players) player where player.value ->> 'team' = 'A' and coalesce((player.value ->> 'was_goalkeeper')::boolean, false)) <> 1
       or (select count(*) from jsonb_array_elements(p_players) player where player.value ->> 'team' = 'B' and coalesce((player.value ->> 'was_goalkeeper')::boolean, false)) <> 1 then
        raise exception 'Each team needs exactly one goalkeeper';
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

create or replace function public.delete_friendly_match(p_match_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
    if not exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin') then
        raise exception 'Administrator permission required' using errcode = '42501';
    end if;
    delete from public.goals where match_id = p_match_id;
    delete from public.match_players where match_id = p_match_id;
    delete from public.friendly_matches where id = p_match_id;
    if not found then raise exception 'Match not found'; end if;
end;
$$;

grant execute on function public.get_admin_players() to authenticated;
grant execute on function public.update_active_player(uuid, text) to authenticated;
grant execute on function public.delete_player(uuid) to authenticated;
grant execute on function public.get_admin_friendly_matches() to authenticated;
grant execute on function public.get_friendly_match_acta(uuid) to authenticated;
grant execute on function public.update_friendly_match_acta(uuid, date, integer, integer, jsonb, jsonb) to authenticated;
grant execute on function public.delete_friendly_match(uuid) to authenticated;
