-- Allow an active league administrator to deactivate or reactivate a player
-- without deleting the player, their profile link, or their match history.

begin;

create or replace function public.set_player_active(
    p_player_id uuid,
    p_is_active boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
    if not private.is_active_league_admin() then
        raise exception 'Active administrator permission required' using errcode = '42501';
    end if;

    if p_player_id is null or p_is_active is null then
        raise exception 'Player id and active state are required' using errcode = '22004';
    end if;

    update public.players as player
    set is_active = p_is_active
    where player.id = p_player_id;

    if not found then
        raise exception 'Player not found' using errcode = 'P0002';
    end if;

    return p_player_id;
end;
$$;

-- Functions are executable by PUBLIC when created unless explicitly revoked.
revoke all on function public.set_player_active(uuid, boolean)
from public, anon, authenticated;
grant execute on function public.set_player_active(uuid, boolean) to authenticated;

commit;

notify pgrst, 'reload schema';
