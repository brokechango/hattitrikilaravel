-- The Auth trigger creates the invited profile before its email link is used.
-- Only an active league administrator may activate that already-linked profile.

begin;

create or replace function public.activate_invited_player_profile(
    p_user_id uuid,
    p_player_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    if not exists (
        select 1
        from public.profiles
        where id = (select auth.uid())
          and role = 'admin'
          and is_active
    ) then
        raise exception 'Administrator permission required' using errcode = '42501';
    end if;

    update public.profiles profile
    set role = 'member',
        is_active = true
    where profile.id = p_user_id
      and profile.player_id = p_player_id
      and profile.role = 'member'
      and exists (
          select 1
          from private.player_invites invite
          where invite.consumed_by = p_user_id
            and invite.player_id = p_player_id
      );

    if not found then
        raise exception 'Invited player profile was not found' using errcode = '23503';
    end if;
end;
$$;

revoke all on function public.activate_invited_player_profile(uuid, uuid) from public, anon;
grant execute on function public.activate_invited_player_profile(uuid, uuid) to authenticated;

commit;

notify pgrst, 'reload schema';
