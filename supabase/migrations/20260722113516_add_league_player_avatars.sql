-- Provides member-only avatar metadata for ranking lists. Object bytes remain in
-- the private avatars bucket and are delivered with short-lived signed URLs.

begin;

create or replace function public.get_league_player_avatars()
returns table (
    player_id uuid,
    avatar_path text,
    avatar_version integer
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
        profiles.player_id,
        profiles.avatar_path,
        coalesce(profiles.avatar_version, 0)
    from public.profiles
    where profiles.is_active
      and profiles.player_id is not null
      and profiles.avatar_path is not null;
end;
$$;

revoke all on function public.get_league_player_avatars() from public, anon;
grant execute on function public.get_league_player_avatars() to authenticated;

commit;

notify pgrst, 'reload schema';
