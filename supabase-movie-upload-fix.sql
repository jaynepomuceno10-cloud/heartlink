-- Run this in the Supabase SQL Editor for the same project configured in Heartlink.
-- The returned row confirms the active bucket accepts MP4 uploads up to 2 GB.

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'heartlink-media',
  'heartlink-media',
  false,
  2147483648,
  array['image/*', 'audio/*', 'video/*', 'video/mp4']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

select id, public, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'heartlink-media';
