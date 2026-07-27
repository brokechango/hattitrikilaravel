-- MVP voting starts with matches created after this migration. It captures the
-- matches that already exist instead of relying on dates or hard-coded IDs,
-- then removes every vote attached to those legacy matches.

begin;

create table if not exists private.match_mvp_voting_exclusions (
    match_id uuid primary key
        references public.friendly_matches(id) on delete cascade,
    excluded_at timestamptz not null default now()
);

alter table private.match_mvp_voting_exclusions enable row level security;

revoke all privileges on table private.match_mvp_voting_exclusions
from public, anon, authenticated;

insert into private.match_mvp_voting_exclusions (match_id)
select matches.id
from public.friendly_matches matches
on conflict (match_id) do nothing;

delete from private.match_mvp_votes votes
using private.match_mvp_voting_exclusions exclusions
where exclusions.match_id = votes.match_id;

create or replace function public.get_mvp_voting_disabled_matches()
returns table (match_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
    if not private.is_active_league_member() then
        raise exception 'Active league membership required' using errcode = '42501';
    end if;

    return query
    select exclusions.match_id
    from private.match_mvp_voting_exclusions exclusions
    order by exclusions.match_id;
end;
$$;

create or replace function public.get_league_match_mvp_votes()
returns table (
    match_id uuid,
    nominee_player_id uuid,
    vote_count integer,
    is_current_vote boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_current_player_id uuid;
begin
    if not private.is_active_league_member() then
        raise exception 'Active league membership required' using errcode = '42501';
    end if;

    select profiles.player_id
    into v_current_player_id
    from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.is_active;

    return query
    select
        votes.match_id,
        votes.nominee_player_id,
        count(*)::integer,
        bool_or(votes.voter_player_id = v_current_player_id)
    from private.match_mvp_votes votes
    where not exists (
        select 1
        from private.match_mvp_voting_exclusions exclusions
        where exclusions.match_id = votes.match_id
    )
    group by votes.match_id, votes.nominee_player_id
    order by votes.match_id, count(*) desc, votes.nominee_player_id;
end;
$$;

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

revoke all on function public.get_mvp_voting_disabled_matches()
from public, anon;
revoke all on function public.get_league_match_mvp_votes()
from public, anon;
revoke all on function public.cast_match_mvp_vote(uuid, uuid)
from public, anon;

grant execute on function public.get_mvp_voting_disabled_matches()
to authenticated;
grant execute on function public.get_league_match_mvp_votes()
to authenticated;
grant execute on function public.cast_match_mvp_vote(uuid, uuid)
to authenticated;

commit;
