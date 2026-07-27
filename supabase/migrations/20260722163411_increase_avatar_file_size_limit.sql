begin;

do $$
begin
    if not exists (select 1 from storage.buckets where id = 'avatars') then
        raise exception 'Avatar storage bucket does not exist';
    end if;
end;
$$;

update storage.buckets
set file_size_limit = 2500000
where id = 'avatars';

commit;
