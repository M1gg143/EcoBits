-- EcoBIts MVP | Supabase SQL Editor
-- Execute este script no projeto Supabase antes de usar cadastro/login e pontos.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Usuário EcoBIts',
  account_type text not null default 'user' check (account_type in ('user','business')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.collection_points (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  description text,
  address text not null,
  city text not null,
  state char(2) not null,
  postal_code text,
  phone text,
  website text,
  opening_hours text,
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  accepted_materials text[] not null default '{}',
  status text not null default 'pending' check (status in ('pending','verified','rejected')),
  is_sponsored boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint accepted_materials_not_empty check (cardinality(accepted_materials) > 0)
);

create index if not exists collection_points_status_idx on public.collection_points(status);
create index if not exists collection_points_city_state_idx on public.collection_points(city, state);

create table if not exists public.favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  point_id uuid not null references public.collection_points(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, point_id)
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name, account_type)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', 'Usuário EcoBIts'),
          case when new.raw_user_meta_data ->> 'account_type' = 'business' then 'business' else 'user' end)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.collection_points enable row level security;
alter table public.favorites enable row level security;

drop policy if exists "Perfil pode ser lido pelo próprio usuário" on public.profiles;
create policy "Perfil pode ser lido pelo próprio usuário" on public.profiles
for select to authenticated using (auth.uid() = id);
drop policy if exists "Usuário pode atualizar próprio perfil" on public.profiles;
create policy "Usuário pode atualizar próprio perfil" on public.profiles
for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "Pontos aprovados são públicos" on public.collection_points;
create policy "Pontos aprovados são públicos" on public.collection_points
for select to anon, authenticated using (status = 'verified' or owner_id = auth.uid());
drop policy if exists "Usuário autenticado pode sugerir ponto pendente" on public.collection_points;
create policy "Usuário autenticado pode sugerir ponto pendente" on public.collection_points
for insert to authenticated with check (auth.uid() = owner_id and status = 'pending' and is_sponsored = false);
drop policy if exists "Dono pode editar próprio ponto pendente" on public.collection_points;
create policy "Dono pode editar próprio ponto pendente" on public.collection_points
for update to authenticated using (auth.uid() = owner_id and status = 'pending')
with check (auth.uid() = owner_id and status = 'pending' and is_sponsored = false);
drop policy if exists "Dono pode excluir próprio ponto pendente" on public.collection_points;
create policy "Dono pode excluir próprio ponto pendente" on public.collection_points
for delete to authenticated using (auth.uid() = owner_id and status = 'pending');

-- Favoritos: cada usuário gerencia apenas os seus.
drop policy if exists "Usuário vê seus favoritos" on public.favorites;
create policy "Usuário vê seus favoritos" on public.favorites
for select to authenticated using (auth.uid() = user_id);
drop policy if exists "Usuário adiciona seus favoritos" on public.favorites;
create policy "Usuário adiciona seus favoritos" on public.favorites
for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "Usuário remove seus favoritos" on public.favorites;
create policy "Usuário remove seus favoritos" on public.favorites
for delete to authenticated using (auth.uid() = user_id);

-- IMPORTANTE: a aprovação/moderação de pontos deve ser feita por um backend seguro
-- ou pelo painel do Supabase por um administrador. Nunca exponha service_role no navegador.
