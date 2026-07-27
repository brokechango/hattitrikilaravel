-- The match_players and goals tables store the side as the team_side enum.
-- JSON acta payloads contain text values, so cast them explicitly on insert.
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
language plpgsql security definer set search_path = public as $$
declare
    v_match_id uuid;
    v_player jsonb;
    v_goal jsonb;
begin
    if p_match_date is null then raise exception 'Invalid match data'; end if;
    perform public.validate_friendly_match_acta(p_team_a_score, p_team_b_score, p_players, p_goals);
    perform public.validate_penalty_shootout(p_team_a_score, p_team_b_score, p_team_a_penalty_score, p_team_b_penalty_score);
    insert into public.friendly_matches (played_on, team_a_score, team_b_score, team_a_penalty_score, team_b_penalty_score)
    values (p_match_date, p_team_a_score, p_team_b_score, p_team_a_penalty_score, p_team_b_penalty_score)
    returning id into v_match_id;
    for v_player in select value from jsonb_array_elements(p_players) loop
        insert into public.match_players (match_id, player_id, team, was_goalkeeper)
        values (
            v_match_id,
            (v_player ->> 'player_id')::uuid,
            (v_player ->> 'team')::public.team_side,
            coalesce((v_player ->> 'was_goalkeeper')::boolean, false)
        );
    end loop;
    for v_goal in select value from jsonb_array_elements(coalesce(p_goals, '[]'::jsonb)) loop
        insert into public.goals (match_id, scorer_player_id, team, goal_count, goalkeeper_player_id, is_own_goal)
        values (
            v_match_id,
            (v_goal ->> 'player_id')::uuid,
            (v_goal ->> 'team')::public.team_side,
            (v_goal ->> 'count')::integer,
            (v_goal ->> 'goalkeeper_id')::uuid,
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
language plpgsql security definer set search_path = public as $$
declare
    v_player jsonb;
    v_goal jsonb;
begin
    if p_match_date is null or not exists (select 1 from public.friendly_matches where id = p_match_id) then
        raise exception 'Match not found';
    end if;
    perform public.validate_friendly_match_acta(p_team_a_score, p_team_b_score, p_players, p_goals);
    perform public.validate_penalty_shootout(p_team_a_score, p_team_b_score, p_team_a_penalty_score, p_team_b_penalty_score);
    update public.friendly_matches
    set played_on = p_match_date,
        team_a_score = p_team_a_score,
        team_b_score = p_team_b_score,
        team_a_penalty_score = p_team_a_penalty_score,
        team_b_penalty_score = p_team_b_penalty_score
    where id = p_match_id;
    delete from public.goals where match_id = p_match_id;
    delete from public.match_players where match_id = p_match_id;
    for v_player in select value from jsonb_array_elements(p_players) loop
        insert into public.match_players (match_id, player_id, team, was_goalkeeper)
        values (
            p_match_id,
            (v_player ->> 'player_id')::uuid,
            (v_player ->> 'team')::public.team_side,
            coalesce((v_player ->> 'was_goalkeeper')::boolean, false)
        );
    end loop;
    for v_goal in select value from jsonb_array_elements(coalesce(p_goals, '[]'::jsonb)) loop
        insert into public.goals (match_id, scorer_player_id, team, goal_count, goalkeeper_player_id, is_own_goal)
        values (
            p_match_id,
            (v_goal ->> 'player_id')::uuid,
            (v_goal ->> 'team')::public.team_side,
            (v_goal ->> 'count')::integer,
            (v_goal ->> 'goalkeeper_id')::uuid,
            coalesce((v_goal ->> 'is_own_goal')::boolean, false)
        );
    end loop;
    return p_match_id;
end;
$$;

grant execute on function public.create_friendly_match_acta(date, integer, integer, integer, integer, jsonb, jsonb) to authenticated;
grant execute on function public.update_friendly_match_acta(uuid, date, integer, integer, integer, integer, jsonb, jsonb) to authenticated;

notify pgrst, 'reload schema';
