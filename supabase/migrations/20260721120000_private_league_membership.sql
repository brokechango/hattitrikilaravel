-- Make every league screen private and keep administration restricted to active admins.
-- Run this after 20260720120000_harden_web_security.sql.

-- PostgreSQL does not allow a newly added enum value to be used until the
-- transaction that added it has committed.
begin;
alter type public.app_role add value if not exists 'member';
commit;

begin;

-- Existing profiles are trusted as current league members. New Auth users are
-- created as inactive members and must be explicitly enabled by an operator.
create table if not exists public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    role public.app_role,
    is_active boolean,
    created_at timestamptz not null default now()
);

alter table public.profiles add column if not exists role public.app_role;
alter table public.profiles add column if not exists is_active boolean;

-- Replace the conventional legacy role constraint, if present, before mapping
-- older non-admin values to the new member role.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles drop constraint if exists profiles_league_role_check;

update public.profiles
set role = case
    when lower(role::text) = 'admin' then 'admin'::public.app_role
    else 'member'::public.app_role
end;

-- Profiles that existed before this migration keep access.
update public.profiles
set is_active = true
where is_active is null;

alter table public.profiles alter column role set default 'member'::public.app_role;
alter table public.profiles alter column role set not null;
alter table public.profiles alter column is_active set default false;
alter table public.profiles alter column is_active set not null;

alter table public.profiles
    add constraint profiles_league_role_check check (role::text in ('member', 'admin'));

insert into public.profiles (id, role, is_active)
select users.id, 'member'::public.app_role, false
from auth.users users
on conflict (id) do nothing;

alter table public.profiles enable row level security;
revoke all privileges on table public.profiles from public, anon, authenticated;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.is_active_league_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from public.profiles
        where profiles.id = (select auth.uid())
          and profiles.is_active
          and profiles.role in ('member', 'admin')
    );
$$;

create or replace function private.is_active_league_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from public.profiles
        where profiles.id = (select auth.uid())
          and profiles.is_active
          and profiles.role = 'admin'
    );
$$;

revoke all on function private.is_active_league_member() from public, anon, authenticated;
revoke all on function private.is_active_league_admin() from public, anon, authenticated;

create or replace function public.handle_new_league_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    insert into public.profiles (id, role, is_active)
    values (new.id, 'member', false)
    on conflict (id) do nothing;
    return new;
end;
$$;

revoke all on function public.handle_new_league_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created_create_league_profile on auth.users;
create trigger on_auth_user_created_create_league_profile
after insert on auth.users
for each row execute function public.handle_new_league_user();

create or replace function public.get_current_user_access()
returns table (is_member boolean, role text)
language sql
stable
security definer
set search_path = ''
as $$
    select
        exists (
            select 1
            from public.profiles
            where profiles.id = (select auth.uid())
              and profiles.is_active
              and profiles.role in ('member', 'admin')
        ) as is_member,
        (
            select profiles.role::text
            from public.profiles
            where profiles.id = (select auth.uid())
              and profiles.is_active
              and profiles.role in ('member', 'admin')
            limit 1
        ) as role;
$$;

create or replace function public.get_current_admin_access()
returns table (is_admin boolean)
language sql
stable
security definer
set search_path = ''
as $$
    select private.is_active_league_admin() as is_admin;
$$;

-- These RPCs used to be public. They now reject every caller without an active
-- profile even if the caller somehow owns a valid Supabase Auth account.
create or replace function public.get_public_league_players()
returns table (
    id uuid,
    name text,
    is_active boolean
)
language plpgsql
security definer
set search_path = ''
as $$
begin
    if not private.is_active_league_member() then
        raise exception 'Active league membership required' using errcode = '42501';
    end if;

    return query
    select players.id, players.name, players.is_active
    from public.players
    order by lower(players.name);
end;
$$;

create or replace function public.get_public_friendly_matches()
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
language plpgsql
security definer
set search_path = ''
as $$
begin
    if not private.is_active_league_member() then
        raise exception 'Active league membership required' using errcode = '42501';
    end if;

    return query
    select
        matches.id,
        matches.played_on,
        matches.team_a_score,
        matches.team_b_score,
        matches.team_a_penalty_score,
        matches.team_b_penalty_score,
        coalesce((
            select jsonb_agg(
                jsonb_build_object(
                    'player_id', match_players.player_id,
                    'team', match_players.team,
                    'was_goalkeeper', match_players.was_goalkeeper
                )
                order by match_players.player_id
            )
            from public.match_players
            where match_players.match_id = matches.id
        ), '[]'::jsonb),
        coalesce((
            select jsonb_agg(
                jsonb_build_object(
                    'player_id', goals.scorer_player_id,
                    'team', goals.team,
                    'count', goals.goal_count,
                    'goalkeeper_id', goals.goalkeeper_player_id,
                    'is_own_goal', goals.is_own_goal
                )
                order by goals.scorer_player_id
            )
            from public.goals
            where goals.match_id = matches.id
        ), '[]'::jsonb)
    from public.friendly_matches matches
    order by matches.played_on desc;
end;
$$;

-- Recreate the administrator read RPCs so inactive administrators cannot keep
-- using an old session. Existing write RPCs are additionally guarded below at
-- the table mutation boundary.
create or replace function public.get_active_players()
returns table (id uuid, name text, is_active boolean, has_cardio boolean, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
    if not private.is_active_league_admin() then
        raise exception 'Active administrator permission required' using errcode = '42501';
    end if;

    return query
    select players.id, players.name, players.is_active, players.has_cardio, players.created_at
    from public.players
    where players.is_active = true
    order by lower(players.name);
end;
$$;

create or replace function public.get_admin_players()
returns table (id uuid, name text, is_active boolean, has_cardio boolean)
language plpgsql
security definer
set search_path = ''
as $$
begin
    if not private.is_active_league_admin() then
        raise exception 'Active administrator permission required' using errcode = '42501';
    end if;

    return query
    select players.id, players.name, players.is_active, players.has_cardio
    from public.players
    order by players.is_active desc, lower(players.name);
end;
$$;

create or replace function public.get_admin_friendly_matches()
returns table (
    id uuid,
    played_on date,
    team_a_score integer,
    team_b_score integer,
    team_a_penalty_score integer,
    team_b_penalty_score integer
)
language plpgsql
security definer
set search_path = ''
as $$
begin
    if not private.is_active_league_admin() then
        raise exception 'Active administrator permission required' using errcode = '42501';
    end if;

    return query
    select matches.id, matches.played_on, matches.team_a_score, matches.team_b_score,
        matches.team_a_penalty_score, matches.team_b_penalty_score
    from public.friendly_matches matches
    order by matches.played_on desc;
end;
$$;

create or replace function public.get_friendly_match_acta(p_match_id uuid)
returns table (
    match_date date,
    team_a_score integer,
    team_b_score integer,
    team_a_penalty_score integer,
    team_b_penalty_score integer,
    participants jsonb,
    goals jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
begin
    if not private.is_active_league_admin() then
        raise exception 'Active administrator permission required' using errcode = '42501';
    end if;

    return query
    select
        matches.played_on,
        matches.team_a_score,
        matches.team_b_score,
        matches.team_a_penalty_score,
        matches.team_b_penalty_score,
        coalesce((
            select jsonb_agg(
                jsonb_build_object(
                    'player_id', match_players.player_id,
                    'team', match_players.team,
                    'was_goalkeeper', match_players.was_goalkeeper
                )
                order by match_players.player_id
            )
            from public.match_players
            where match_players.match_id = matches.id
        ), '[]'::jsonb),
        coalesce((
            select jsonb_agg(
                jsonb_build_object(
                    'player_id', goals.scorer_player_id,
                    'team', goals.team,
                    'count', goals.goal_count,
                    'goalkeeper_id', goals.goalkeeper_player_id,
                    'is_own_goal', goals.is_own_goal
                )
            )
            from public.goals
            where goals.match_id = matches.id
        ), '[]'::jsonb)
    from public.friendly_matches matches
    where matches.id = p_match_id;
end;
$$;

create or replace function private.require_active_league_admin_for_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    -- Direct maintenance from the SQL editor/service role has no auth.uid().
    -- Every client-originated mutation must come from an active administrator.
    if (select auth.uid()) is not null and not private.is_active_league_admin() then
        raise exception 'Active administrator permission required' using errcode = '42501';
    end if;
    return null;
end;
$$;

revoke all on function private.require_active_league_admin_for_mutation()
from public, anon, authenticated;

drop trigger if exists require_active_admin_on_players on public.players;
create trigger require_active_admin_on_players
before insert or update or delete on public.players
for each statement execute function private.require_active_league_admin_for_mutation();

drop trigger if exists require_active_admin_on_friendly_matches on public.friendly_matches;
create trigger require_active_admin_on_friendly_matches
before insert or update or delete on public.friendly_matches
for each statement execute function private.require_active_league_admin_for_mutation();

drop trigger if exists require_active_admin_on_match_players on public.match_players;
create trigger require_active_admin_on_match_players
before insert or update or delete on public.match_players
for each statement execute function private.require_active_league_admin_for_mutation();

drop trigger if exists require_active_admin_on_goals on public.goals;
create trigger require_active_admin_on_goals
before insert or update or delete on public.goals
for each statement execute function private.require_active_league_admin_for_mutation();

revoke all on function public.get_current_user_access() from public, anon;
revoke all on function public.get_current_admin_access() from public, anon;
revoke all on function public.get_public_league_players() from public, anon;
revoke all on function public.get_public_friendly_matches() from public, anon;
revoke all on function public.get_active_players() from public, anon;
revoke all on function public.get_admin_players() from public, anon;
revoke all on function public.get_admin_friendly_matches() from public, anon;
revoke all on function public.get_friendly_match_acta(uuid) from public, anon;

grant execute on function public.get_current_user_access() to authenticated;
grant execute on function public.get_current_admin_access() to authenticated;
grant execute on function public.get_public_league_players() to authenticated;
grant execute on function public.get_public_friendly_matches() to authenticated;
grant execute on function public.get_active_players() to authenticated;
grant execute on function public.get_admin_players() to authenticated;
grant execute on function public.get_admin_friendly_matches() to authenticated;
grant execute on function public.get_friendly_match_acta(uuid) to authenticated;

-- Keep the base tables inaccessible through PostgREST. SECURITY DEFINER RPCs
-- above expose only their deliberately constrained result shapes.
revoke all privileges on table
    public.profiles,
    public.players,
    public.friendly_matches,
    public.match_players,
    public.goals
from public, anon, authenticated;

commit;

notify pgrst, 'reload schema';

-- Account activation examples (run manually in the Supabase SQL editor):
--
-- update public.profiles
-- set role = 'member', is_active = true
-- where id = (select id from auth.users where email = 'jugador@ejemplo.com');
--
-- update public.profiles
-- set role = 'admin', is_active = true
-- where id = (select id from auth.users where email = 'mister@ejemplo.com');
--
-- update public.profiles
-- set role = 'member', is_active = false
-- where id = (select id from auth.users where email = 'baja@ejemplo.com');
