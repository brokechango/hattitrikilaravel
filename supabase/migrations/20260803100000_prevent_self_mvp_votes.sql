-- MVP votes must always be cast for a different match participant.

begin;

delete from private.match_mvp_votes
where voter_player_id = nominee_player_id;

alter table private.match_mvp_votes
    drop constraint if exists match_mvp_votes_no_self_vote;

alter table private.match_mvp_votes
    add constraint match_mvp_votes_no_self_vote
    check (voter_player_id <> nominee_player_id);

create or replace function public.cast_match_mvp_vote(
    p_match_id uuid,
    p_nominee_player_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_voter_player_id uuid;
begin
    if not private.is_active_league_member() then
        raise exception 'Active league membership required' using errcode = '42501';
    end if;

    if exists (
        select 1
        from private.match_mvp_voting_exclusions exclusions
        where exclusions.match_id = p_match_id
    ) then
        raise exception 'MVP voting is not enabled for this match'
            using errcode = '42501';
    end if;

    select profiles.player_id
    into v_voter_player_id
    from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.is_active;

    if v_voter_player_id is null then
        raise exception 'Current account is not linked to a player' using errcode = '23503';
    end if;

    if not exists (
        select 1
        from public.match_players
        where match_players.match_id = p_match_id
          and match_players.player_id = v_voter_player_id
    ) then
        raise exception 'Only match participants can vote for its MVP' using errcode = '42501';
    end if;

    if p_nominee_player_id = v_voter_player_id then
        raise exception 'Players cannot vote for themselves' using errcode = '23514';
    end if;

    if p_nominee_player_id is null or not exists (
        select 1
        from public.match_players
        where match_players.match_id = p_match_id
          and match_players.player_id = p_nominee_player_id
    ) then
        raise exception 'The MVP candidate must have participated in the match'
            using errcode = '23503';
    end if;

    insert into private.match_mvp_votes (
        match_id,
        voter_player_id,
        nominee_player_id
    )
    values (
        p_match_id,
        v_voter_player_id,
        p_nominee_player_id
    )
    on conflict (match_id, voter_player_id) do update
    set nominee_player_id = excluded.nominee_player_id,
        updated_at = now();

    return p_nominee_player_id;
end;
$$;

revoke all on function public.cast_match_mvp_vote(uuid, uuid)
from public, anon;

grant execute on function public.cast_match_mvp_vote(uuid, uuid)
to authenticated;

commit;
