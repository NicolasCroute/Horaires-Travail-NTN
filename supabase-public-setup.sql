create table if not exists public.work_days_public (
  work_date date primary key,
  target_minutes integer not null default 480,
  arrival time,
  lunch_out time,
  lunch_in time,
  departure time,
  updated_at timestamptz not null default now()
);

alter table public.work_days_public enable row level security;

drop policy if exists "Acces public lecture badgeage" on public.work_days_public;
drop policy if exists "Acces public creation badgeage" on public.work_days_public;
drop policy if exists "Acces public modification badgeage" on public.work_days_public;
drop policy if exists "Acces public suppression badgeage" on public.work_days_public;

create policy "Acces public lecture badgeage"
on public.work_days_public
for select
to anon
using (true);

create policy "Acces public creation badgeage"
on public.work_days_public
for insert
to anon
with check (true);

create policy "Acces public modification badgeage"
on public.work_days_public
for update
to anon
using (true)
with check (true);

create policy "Acces public suppression badgeage"
on public.work_days_public
for delete
to anon
using (true);

grant select, insert, update, delete on public.work_days_public to anon;

create table if not exists public.work_notes_public (
  id uuid primary key default gen_random_uuid(),
  note_date date not null,
  note_text text not null,
  is_done boolean not null default false,
  reminder_date date,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.work_notes_public enable row level security;

drop policy if exists "Acces public lecture notes" on public.work_notes_public;
drop policy if exists "Acces public creation notes" on public.work_notes_public;
drop policy if exists "Acces public modification notes" on public.work_notes_public;
drop policy if exists "Acces public suppression notes" on public.work_notes_public;

create policy "Acces public lecture notes"
on public.work_notes_public
for select
to anon
using (true);

create policy "Acces public creation notes"
on public.work_notes_public
for insert
to anon
with check (true);

create policy "Acces public modification notes"
on public.work_notes_public
for update
to anon
using (true)
with check (true);

create policy "Acces public suppression notes"
on public.work_notes_public
for delete
to anon
using (true);

grant select, insert, update, delete on public.work_notes_public to anon;

create table if not exists public.quick_links_public (
  id uuid primary key default gen_random_uuid(),
  category text not null default 'Général',
  label text not null,
  url text not null,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.quick_links_public enable row level security;

drop policy if exists "Acces public lecture liens" on public.quick_links_public;
drop policy if exists "Acces public creation liens" on public.quick_links_public;
drop policy if exists "Acces public modification liens" on public.quick_links_public;
drop policy if exists "Acces public suppression liens" on public.quick_links_public;

create policy "Acces public lecture liens"
on public.quick_links_public
for select
to anon
using (true);

create policy "Acces public creation liens"
on public.quick_links_public
for insert
to anon
with check (true);

create policy "Acces public modification liens"
on public.quick_links_public
for update
to anon
using (true)
with check (true);

create policy "Acces public suppression liens"
on public.quick_links_public
for delete
to anon
using (true);

grant select, insert, update, delete on public.quick_links_public to anon;
