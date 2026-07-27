-- Restrict the browser client to the deliberately exposed RPC surface.
-- SECURITY DEFINER functions keep using their owner privileges; anon and
-- authenticated clients no longer receive direct access to the base tables.

begin;

alter table if exists public.profiles enable row level security;
alter table if exists public.players enable row level security;
alter table if exists public.friendly_matches enable row level security;
alter table if exists public.match_players enable row level security;
alter table if exists public.goals enable row level security;

revoke all privileges on table
    public.profiles,
    public.players,
    public.friendly_matches,
    public.match_players,
    public.goals
from public, anon, authenticated;

-- Prevent untrusted roles from shadowing objects resolved by older functions
-- whose fixed search_path is `public`.
revoke create on schema public from public, anon, authenticated;
grant usage on schema public to anon, authenticated;

create or replace function public.get_current_admin_access()
returns table (is_admin boolean)
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from public.profiles
        where profiles.id = (select auth.uid())
          and profiles.role = 'admin'
    ) as is_admin;
$$;

-- PostgreSQL grants EXECUTE to PUBLIC for new functions unless it is revoked.
-- Public read RPCs are the only functions callable without authentication.
revoke all on function public.get_public_league_players() from public;
revoke all on function public.get_public_friendly_matches() from public;
grant execute on function public.get_public_league_players() to anon, authenticated;
grant execute on function public.get_public_friendly_matches() to anon, authenticated;

revoke all on function public.get_current_admin_access() from public, anon;
revoke all on function public.get_active_players() from public, anon;
revoke all on function public.get_admin_players() from public, anon;
revoke all on function public.create_active_player(text, boolean) from public, anon;
revoke all on function public.update_active_player(uuid, text, boolean) from public, anon;
revoke all on function public.delete_player(uuid) from public, anon;
revoke all on function public.get_admin_friendly_matches() from public, anon;
revoke all on function public.get_friendly_match_acta(uuid) from public, anon;
revoke all on function public.create_friendly_match_acta(
    date, integer, integer, integer, integer, jsonb, jsonb
) from public, anon;
revoke all on function public.update_friendly_match_acta(
    uuid, date, integer, integer, integer, integer, jsonb, jsonb
) from public, anon;
revoke all on function public.delete_friendly_match(uuid) from public, anon;

grant execute on function public.get_current_admin_access() to authenticated;
grant execute on function public.get_active_players() to authenticated;
grant execute on function public.get_admin_players() to authenticated;
grant execute on function public.create_active_player(text, boolean) to authenticated;
grant execute on function public.update_active_player(uuid, text, boolean) to authenticated;
grant execute on function public.delete_player(uuid) to authenticated;
grant execute on function public.get_admin_friendly_matches() to authenticated;
grant execute on function public.get_friendly_match_acta(uuid) to authenticated;
grant execute on function public.create_friendly_match_acta(
    date, integer, integer, integer, integer, jsonb, jsonb
) to authenticated;
grant execute on function public.update_friendly_match_acta(
    uuid, date, integer, integer, integer, integer, jsonb, jsonb
) to authenticated;
grant execute on function public.delete_friendly_match(uuid) to authenticated;

-- Validation helpers are internal to the SECURITY DEFINER write functions.
revoke all on function public.validate_friendly_match_acta(
    integer, integer, jsonb, jsonb
) from public, anon, authenticated;
revoke all on function public.validate_penalty_shootout(
    integer, integer, integer, integer
) from public, anon, authenticated;

commit;
