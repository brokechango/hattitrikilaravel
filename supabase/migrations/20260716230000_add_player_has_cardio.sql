-- `has_cardio` only records whether a player is currently in good physical shape.
alter table public.players
    add column if not exists has_cardio boolean not null default false;

drop function if exists public.get_active_players();
create function public.get_active_players()
returns table (id uuid, name text, is_active boolean, has_cardio boolean, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
    if not exists (
        select 1 from public.profiles
        where profiles.id = auth.uid() and profiles.role = 'admin'
    ) then
        raise exception 'Administrator permission required' using errcode = '42501';
    end if;

    return query
    select players.id, players.name, players.is_active, players.has_cardio, players.created_at
    from public.players
    where players.is_active = true
    order by lower(players.name);
end;
$$;

drop function if exists public.get_admin_players();
create function public.get_admin_players()
returns table (id uuid, name text, is_active boolean, has_cardio boolean)
language plpgsql security definer set search_path = public as $$
begin
    if not exists (
        select 1 from public.profiles
        where profiles.id = auth.uid() and profiles.role = 'admin'
    ) then
        raise exception 'Administrator permission required' using errcode = '42501';
    end if;

    return query
    select players.id, players.name, players.is_active, players.has_cardio
    from public.players
    order by players.is_active desc, lower(players.name);
end;
$$;

drop function if exists public.create_active_player(text);
create function public.create_active_player(p_name text, p_has_cardio boolean default false)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
    v_player_id uuid;
begin
    if not exists (
        select 1 from public.profiles
        where profiles.id = auth.uid() and profiles.role = 'admin'
    ) then
        raise exception 'Administrator permission required' using errcode = '42501';
    end if;
    if char_length(trim(coalesce(p_name, ''))) = 0 then
        raise exception 'Player name is required';
    end if;

    insert into public.players (name, is_active, has_cardio)
    values (trim(p_name), true, coalesce(p_has_cardio, false))
    returning id into v_player_id;

    return v_player_id;
end;
$$;

drop function if exists public.update_active_player(uuid, text);
create function public.update_active_player(p_player_id uuid, p_name text, p_has_cardio boolean default false)
returns uuid
language plpgsql security definer set search_path = public as $$
begin
    if not exists (
        select 1 from public.profiles
        where profiles.id = auth.uid() and profiles.role = 'admin'
    ) then
        raise exception 'Administrator permission required' using errcode = '42501';
    end if;
    if char_length(trim(coalesce(p_name, ''))) = 0 then
        raise exception 'Player name is required';
    end if;

    update public.players
    set name = trim(p_name), has_cardio = coalesce(p_has_cardio, false)
    where id = p_player_id;
    if not found then raise exception 'Player not found'; end if;
    return p_player_id;
end;
$$;

grant execute on function public.get_active_players() to authenticated;
grant execute on function public.get_admin_players() to authenticated;
grant execute on function public.create_active_player(text, boolean) to authenticated;
grant execute on function public.update_active_player(uuid, text, boolean) to authenticated;
