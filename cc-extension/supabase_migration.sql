-- Run this in Supabase SQL Editor
-- Creates the table that stores each user's captured Amazon session

create table if not exists public.user_amazon_sessions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  cookies         jsonb not null,
  captured_at     timestamptz not null default now(),
  expires_at      timestamptz,
  user_agent      text,
  is_valid        boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- One row per user — upsert on user_id
  constraint user_amazon_sessions_user_id_key unique (user_id)
);

-- Auto-update updated_at on any change
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_user_amazon_sessions_updated_at on public.user_amazon_sessions;
create trigger set_user_amazon_sessions_updated_at
  before update on public.user_amazon_sessions
  for each row execute function public.set_updated_at();

-- RLS: users can only read/write their own row
alter table public.user_amazon_sessions enable row level security;

create policy "Users can read own session"
  on public.user_amazon_sessions for select
  using (auth.uid() = user_id);

create policy "Users can upsert own session"
  on public.user_amazon_sessions for insert
  with check (auth.uid() = user_id);

create policy "Users can update own session"
  on public.user_amazon_sessions for update
  using (auth.uid() = user_id);
