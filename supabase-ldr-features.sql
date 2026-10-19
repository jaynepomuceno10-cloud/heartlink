-- Run after supabase-sync.sql in the Supabase SQL Editor.
-- Adds opt-in, short-lived location sharing and private Web Push subscriptions.

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

create or replace function public.set_heartlink_record_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_heartlink_record_updated_at on public.couple_app_data;
create trigger set_heartlink_record_updated_at
  before update on public.couple_app_data
  for each row execute function public.set_heartlink_record_updated_at();

drop policy if exists "Couple members can read app data" on public.couple_app_data;
create policy "Couple members can read app data"
  on public.couple_app_data for select to authenticated
  using (
    public.is_heartlink_couple_member(couple_code)
    and (
      data_type <> 'location'
      or updated_at > now() - interval '2 minutes'
      or item_id = auth.uid()::text
    )
  );

drop policy if exists "Couple members can add app data" on public.couple_app_data;
create policy "Couple members can add app data"
  on public.couple_app_data for insert to authenticated
  with check (
    public.is_heartlink_couple_member(couple_code)
    and (
      data_type <> 'location'
      or (item_id = auth.uid()::text and payload ->> 'user_id' = auth.uid()::text)
    )
  );

drop policy if exists "Couple members can update app data" on public.couple_app_data;
create policy "Couple members can update app data"
  on public.couple_app_data for update to authenticated
  using (
    public.is_heartlink_couple_member(couple_code)
    and (data_type <> 'location' or item_id = auth.uid()::text)
  )
  with check (
    public.is_heartlink_couple_member(couple_code)
    and (
      data_type <> 'location'
      or (item_id = auth.uid()::text and payload ->> 'user_id' = auth.uid()::text)
    )
  );

drop policy if exists "Couple members can delete app data" on public.couple_app_data;
create policy "Couple members can delete app data"
  on public.couple_app_data for delete to authenticated
  using (
    public.is_heartlink_couple_member(couple_code)
    and (data_type <> 'location' or item_id = auth.uid()::text)
  );

create table if not exists public.couple_push_subscriptions (
  endpoint text primary key,
  user_id uuid not null,
  user_email text not null,
  couple_code text not null,
  subscription jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists couple_push_subscriptions_recipient_idx
  on public.couple_push_subscriptions (couple_code, user_email);

alter table public.couple_push_subscriptions enable row level security;
revoke all on public.couple_push_subscriptions from anon, authenticated;
grant all on public.couple_push_subscriptions to service_role;

update storage.buckets
set file_size_limit = 2147483648,
    allowed_mime_types = null
where id = 'heartlink-media';
