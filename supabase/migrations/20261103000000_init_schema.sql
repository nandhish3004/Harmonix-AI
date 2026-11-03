-- ==============================================================================
-- HARMONIX-AR: COMPLETE IDEMPOTENT SUPABASE SQL SCHEMA
-- Safe to run and re-run in the Supabase SQL Editor
-- ==============================================================================

-- 1. Profiles Table (Linked to auth.users)
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  full_name text,
  avatar_url text,
  language_preference text default 'en',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Workpiece Scans Table
create table if not exists public.workpiece_scans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  name text not null,
  material_type text not null,
  thickness_mm numeric not null default 1.6,
  boundary_polygon jsonb not null default '[]'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. Inspection Sessions Table
create table if not exists public.inspection_sessions (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid references public.workpiece_scans(id) on delete cascade not null,
  peak_frequency_hz numeric not null,
  active_mode text not null,
  vibration_score numeric not null default 0.0,
  defect_detected boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable Row Level Security (RLS)
alter table public.profiles enable row level security;
alter table public.workpiece_scans enable row level security;
alter table public.inspection_sessions enable row level security;

-- Performance Indexes
create index if not exists idx_workpiece_scans_user_id on public.workpiece_scans(user_id);
create index if not exists idx_inspection_sessions_scan_id on public.inspection_sessions(scan_id);

-- Profiles RLS Policies
drop policy if exists "Users can view their own profile" on public.profiles;
create policy "Users can view their own profile" on public.profiles for select using (auth.uid() = id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile" on public.profiles for update using (auth.uid() = id);

drop policy if exists "Users can insert their own profile" on public.profiles;
create policy "Users can insert their own profile" on public.profiles for insert with check (auth.uid() = id);

-- Workpiece Scans RLS Policies
drop policy if exists "Users can view their own workpiece scans" on public.workpiece_scans;
create policy "Users can view their own workpiece scans" on public.workpiece_scans for select using (auth.uid() = user_id);

drop policy if exists "Users can create their own workpiece scans" on public.workpiece_scans;
create policy "Users can create their own workpiece scans" on public.workpiece_scans for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update their own workpiece scans" on public.workpiece_scans;
create policy "Users can update their own workpiece scans" on public.workpiece_scans for update using (auth.uid() = user_id);

drop policy if exists "Users can delete their own workpiece scans" on public.workpiece_scans;
create policy "Users can delete their own workpiece scans" on public.workpiece_scans for delete using (auth.uid() = user_id);

-- Inspection Sessions RLS Policies
drop policy if exists "Users can view their own inspection sessions" on public.inspection_sessions;
create policy "Users can view their own inspection sessions" on public.inspection_sessions for select using (
  exists (
    select 1 from public.workpiece_scans
    where public.workpiece_scans.id = public.inspection_sessions.scan_id
    and public.workpiece_scans.user_id = auth.uid()
  )
);

drop policy if exists "Users can create inspection sessions for their scans" on public.inspection_sessions;
create policy "Users can create inspection sessions for their scans" on public.inspection_sessions for insert with check (
  exists (
    select 1 from public.workpiece_scans
    where public.workpiece_scans.id = public.inspection_sessions.scan_id
    and public.workpiece_scans.user_id = auth.uid()
  )
);

drop policy if exists "Users can update inspection sessions for their scans" on public.inspection_sessions;
create policy "Users can update inspection sessions for their scans" on public.inspection_sessions for update using (
  exists (
    select 1 from public.workpiece_scans
    where public.workpiece_scans.id = public.inspection_sessions.scan_id
    and public.workpiece_scans.user_id = auth.uid()
  )
);

drop policy if exists "Users can delete inspection sessions for their scans" on public.inspection_sessions;
create policy "Users can delete inspection sessions for their scans" on public.inspection_sessions for delete using (
  exists (
    select 1 from public.workpiece_scans
    where public.workpiece_scans.id = public.inspection_sessions.scan_id
    and public.workpiece_scans.user_id = auth.uid()
  )
);

-- Real-time Sync & Trigger for new Auth signups
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url, language_preference)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url',
    coalesce(new.raw_user_meta_data->>'language_preference', 'en')
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(excluded.full_name, public.profiles.full_name),
    avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
