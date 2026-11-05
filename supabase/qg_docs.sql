-- QG Business : table de synchronisation (à coller une fois dans Supabase > SQL Editor > Run)
create table if not exists public.qg_docs (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  col text not null,
  id text not null,
  data jsonb,
  deleted boolean not null default false,
  ts bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, col, id)
);
alter table public.qg_docs enable row level security;
drop policy if exists "mes donnees" on public.qg_docs;
create policy "mes donnees" on public.qg_docs for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create or replace function public.qg_touch() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists qg_touch on public.qg_docs;
create trigger qg_touch before insert or update on public.qg_docs for each row execute function public.qg_touch();
create index if not exists qg_docs_pull on public.qg_docs (user_id, updated_at);
