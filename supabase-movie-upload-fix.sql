-- Run this in the Supabase SQL Editor for the same project configured in Heartlink.
-- It enables movie records in the shared-data constraint and allows private movie uploads.

do $$
declare
  check_constraint record;
begin
  for check_constraint in
    select conname
    from pg_constraint
    where conrelid = 'public.couple_app_data'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%data_type%'
  loop
    execute format(
      'alter table public.couple_app_data drop constraint %I',
      check_constraint.conname
    );
  end loop;
end
$$;

alter table public.couple_app_data
  add constraint couple_app_data_data_type_check
  check (
    data_type in (
      'chat',
      'signal',
      'post',
      'song',
      'schedule',
      'settings',
      'wallpaper',
      'relationship',
      'playback',
      'movie',
      'movie_playback',
      'location'
    )
  );

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit
)
values (
  'heartlink-media',
  'heartlink-media',
  false,
  2147483648
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = null;

select
  bucket.id,
  bucket.public,
  bucket.file_size_limit,
  bucket.allowed_mime_types,
  pg_get_constraintdef(constraint_row.oid) as allowed_data_types
from storage.buckets as bucket
join pg_constraint as constraint_row
  on constraint_row.conrelid = 'public.couple_app_data'::regclass
  and constraint_row.conname = 'couple_app_data_data_type_check'
where bucket.id = 'heartlink-media';
