-- Links invited league accounts to pre-existing sporting players and exposes
-- member-only player profiles. Run this after 20260721120000_private_league_membership.sql.

begin;

alter table public.profiles add column if not exists player_id uuid references public.players(id);
alter table public.profiles add column if not exists avatar_path text;
alter table public.profiles add column if not exists avatar_version integer not null default 0;
alter table public.profiles add column if not exists updated_at timestamptz not null default now();

create unique index if not exists profiles_player_id_key
    on public.profiles(player_id)
    where player_id is not null;

-- Existing members are deliberately left valid during rollout. Any new or
-- changed active account must already point at its sporting player.
alter table public.profiles drop constraint if exists profiles_active_requires_player;
alter table public.profiles add constraint profiles_active_requires_player
    check (not is_active or player_id is not null) not valid;

create table if not exists private.player_invites (
    token uuid primary key,
    player_id uuid not null unique references public.players(id) on delete cascade,
    email text not null,
    created_by uuid not null references auth.users(id) on delete cascade,
    expires_at timestamptz not null,
    consumed_at timestamptz,
    consumed_by uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now(),
    constraint player_invites_email_not_blank check (length(trim(email)) > 0)
);

revoke all on table private.player_invites from public, anon, authenticated;

-- Called with the administrator's JWT by the Edge Function before it uses its
-- server-only Auth key to send the actual invitation.
create or replace function public.create_player_invite(
    p_player_id uuid,
    p_email text,
    p_token uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_email text := lower(trim(coalesce(p_email, '')));
begin
    if not private.is_active_league_admin() then
        raise exception 'Active administrator permission required' using errcode = '42501';
    end if;

    if p_player_id is null or p_token is null or
        v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
        raise exception 'Invalid player invitation' using errcode = '22023';
    end if;

    if not exists (
        select 1 from public.players
        where id = p_player_id and is_active
    ) then
        raise exception 'Active player required' using errcode = '23503';
    end if;

    if exists (select 1 from public.profiles where player_id = p_player_id) then
        raise exception 'Player already has an account' using errcode = '23505';
    end if;

    -- Expired invitations never keep a player hostage. A new invitation gets a
    -- fresh random token and expiry after the old reservation is removed.
    delete from private.player_invites
    where player_id = p_player_id
      and consumed_at is null
      and expires_at <= now();

    if exists (
        select 1 from private.player_invites
        where player_id = p_player_id and consumed_at is null
    ) then
        raise exception 'Player already has a pending invitation' using errcode = '23505';
    end if;

    insert into private.player_invites (token, player_id, email, created_by, expires_at)
    values (p_token, p_player_id, v_email, (select auth.uid()), now() + interval '7 days');
end;
$$;

create or replace function public.get_invitable_players()
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
    where players.is_active
      and not exists (
          select 1 from public.profiles
          where profiles.player_id = players.id
      )
      and not exists (
          select 1 from private.player_invites
          where player_invites.player_id = players.id
            and player_invites.consumed_at is null
            and player_invites.expires_at > now()
      )
    order by lower(players.name);
end;
$$;

create or replace function public.cancel_player_invite(p_token uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    if not private.is_active_league_admin() then
        raise exception 'Active administrator permission required' using errcode = '42501';
    end if;

    delete from private.player_invites
    where token = p_token
      and created_by = (select auth.uid())
      and consumed_at is null;
end;
$$;

-- Auth creates the user as soon as an invitation is sent. The one-time token
-- is only an index into our private invite record; the player id itself is
-- never trusted from client-provided metadata.
create or replace function public.handle_new_league_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_token_text text := new.raw_user_meta_data ->> 'invite_token';
    v_invite private.player_invites%rowtype;
begin
    if v_token_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        select * into v_invite
        from private.player_invites
        where token = v_token_text::uuid
          and lower(email) = lower(new.email)
          and consumed_at is null
          and expires_at > now()
        for update;

        if found then
            update private.player_invites
            set consumed_at = now(), consumed_by = new.id
            where token = v_invite.token;
        end if;
    end if;

    insert into public.profiles (id, role, is_active, player_id)
    values (new.id, 'member', false, v_invite.player_id)
    on conflict (id) do nothing;

    return new;
end;
$$;

create or replace function public.get_league_player_profile(p_player_id uuid)
returns table (
    player_id uuid,
    avatar_path text,
    avatar_version integer,
    is_current_player boolean,
    has_linked_account boolean
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
        players.id,
        profiles.avatar_path,
        coalesce(profiles.avatar_version, 0),
        coalesce(profiles.id = (select auth.uid()), false),
        profiles.id is not null
    from public.players
    left join public.profiles
        on profiles.player_id = players.id
       and profiles.is_active
    where players.id = p_player_id;
end;
$$;

create or replace function public.get_current_league_player_id()
returns table (player_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
begin
    if not private.is_active_league_member() then
        raise exception 'Active league membership required' using errcode = '42501';
    end if;

    return query
    select profiles.player_id
    from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.player_id is not null;
end;
$$;

-- The bucket remains private. This helper can only reveal the caller's own
-- membership state and is granted solely so Storage RLS can evaluate it.
create or replace function public.can_read_league_avatars()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select private.is_active_league_member();
$$;

create or replace function public.set_own_avatar(p_avatar_path text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_avatar_path text := trim(coalesce(p_avatar_path, ''));
    v_version integer;
begin
    if not private.is_active_league_member() then
        raise exception 'Active league membership required' using errcode = '42501';
    end if;

    if v_avatar_path !~ ('^' || (select auth.uid())::text || '/[0-9a-f-]+\.(jpg|jpeg|webp)$') then
        raise exception 'Invalid avatar path' using errcode = '22023';
    end if;

    if not exists (
        select 1 from storage.objects
        where bucket_id = 'avatars' and name = v_avatar_path
    ) then
        raise exception 'Avatar object not found' using errcode = '23503';
    end if;

    update public.profiles
    set avatar_path = v_avatar_path,
        avatar_version = avatar_version + 1,
        updated_at = now()
    where id = (select auth.uid())
      and player_id is not null
    returning avatar_version into v_version;

    if v_version is null then
        raise exception 'Current account is not linked to a player' using errcode = '23503';
    end if;

    return v_version;
end;
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'avatars',
    'avatars',
    false,
    307200,
    array['image/jpeg', 'image/webp']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "League members can read avatars" on storage.objects;
drop policy if exists "Players can upload their own avatar" on storage.objects;
drop policy if exists "Players can update their own avatar" on storage.objects;
drop policy if exists "Players can delete their own avatar" on storage.objects;

create policy "League members can read avatars"
on storage.objects for select to authenticated
using (bucket_id = 'avatars' and public.can_read_league_avatars());

create policy "Players can upload their own avatar"
on storage.objects for insert to authenticated
with check (
    bucket_id = 'avatars'
    and public.can_read_league_avatars()
    and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "Players can update their own avatar"
on storage.objects for update to authenticated
using (
    bucket_id = 'avatars'
    and public.can_read_league_avatars()
    and (storage.foldername(name))[1] = (select auth.uid()::text)
)
with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "Players can delete their own avatar"
on storage.objects for delete to authenticated
using (
    bucket_id = 'avatars'
    and public.can_read_league_avatars()
    and (storage.foldername(name))[1] = (select auth.uid()::text)
);

revoke all on function public.create_player_invite(uuid, text, uuid) from public, anon;
revoke all on function public.cancel_player_invite(uuid) from public, anon;
revoke all on function public.get_invitable_players() from public, anon;
revoke all on function public.get_league_player_profile(uuid) from public, anon;
revoke all on function public.get_current_league_player_id() from public, anon;
revoke all on function public.can_read_league_avatars() from public, anon;
revoke all on function public.set_own_avatar(text) from public, anon;

grant execute on function public.create_player_invite(uuid, text, uuid) to authenticated;
grant execute on function public.cancel_player_invite(uuid) to authenticated;
grant execute on function public.get_invitable_players() to authenticated;
grant execute on function public.get_league_player_profile(uuid) to authenticated;
grant execute on function public.get_current_league_player_id() to authenticated;
grant execute on function public.can_read_league_avatars() to authenticated;
grant execute on function public.set_own_avatar(text) to authenticated;

commit;

notify pgrst, 'reload schema';
