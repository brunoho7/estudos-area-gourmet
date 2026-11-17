-- ============================================================
-- Área Gourmet · Schema do Supabase com autenticação
-- ------------------------------------------------------------
-- Como usar:
--   1. Abra o projeto no Supabase.
--   2. Vá em "SQL Editor" > "New query".
--   3. Cole TODO este arquivo e clique em "Run".
--
-- Pode executar novamente: o script é idempotente.
--
-- O que ele faz:
--   • cria a tabela de perfis (nome/e-mail de cada usuário);
--   • vincula cada reserva ao usuário autenticado (user_id);
--   • libera leitura apenas para usuários logados;
--   • permite criar/cancelar somente via funções autenticadas;
--   • cada morador só pode cancelar as próprias reservas.
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- 1. Reservas ----------

create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  name text not null,
  apartment text not null,
  phone text not null default '',
  guests integer not null default 1,
  notes text not null default '',
  created_at timestamptz not null default now(),
  constraint reservations_date_unique unique (date),
  constraint reservations_name_len check (char_length(name) between 3 and 60),
  constraint reservations_apartment_len check (char_length(apartment) between 1 and 20),
  constraint reservations_phone_len check (char_length(phone) <= 30),
  constraint reservations_guests_range check (guests between 1 and 40),
  constraint reservations_notes_len check (char_length(notes) <= 120)
);

alter table public.reservations
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

create index if not exists reservations_user_id_idx
  on public.reservations (user_id);

-- ---------- 2. Perfis ----------

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  email text,
  apartment text,
  block text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_apartment_len check (apartment is null or char_length(apartment) <= 20),
  constraint profiles_block_len check (block is null or char_length(block) <= 20),
  constraint profiles_phone_len check (phone is null or char_length(phone) <= 30)
);

-- Garante os campos caso a tabela já existisse antes desta versão
alter table public.profiles add column if not exists apartment text;
alter table public.profiles add column if not exists block text;
alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists updated_at timestamptz not null default now();

alter table public.profiles enable row level security;

drop policy if exists "perfil proprio select" on public.profiles;
create policy "perfil proprio select"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

drop policy if exists "perfil proprio update" on public.profiles;
drop policy if exists "perfil proprio insert" on public.profiles;

grant usage on schema public to anon, authenticated;

revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;

-- ---------- 3. Criação automática do perfil ----------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, email)
  values (
    new.id,
    coalesce(
      nullif(btrim(new.raw_user_meta_data->>'name'), ''),
      split_part(coalesce(new.email, ''), '@', 1)
    ),
    new.email
  )
  on conflict (id) do update set email = excluded.email;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Preenche perfis de usuários que já existiam antes deste script
insert into public.profiles (id, name, email)
select
  id,
  coalesce(nullif(btrim(raw_user_meta_data->>'name'), ''), split_part(coalesce(email, ''), '@', 1)),
  email
from auth.users
on conflict (id) do nothing;

-- ---------- 4. Salvar meu perfil ----------

drop function if exists public.save_my_profile(text, text, text, text);

create or replace function public.save_my_profile(
  p_name text,
  p_apartment text default '',
  p_block text default '',
  p_phone text default ''
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_apartment text := nullif(btrim(coalesce(p_apartment, '')), '');
  v_block text := nullif(btrim(coalesce(p_block, '')), '');
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
  v_email text;
  v_result public.profiles;
begin
  if v_user is null then
    raise exception 'Faça login para salvar seu perfil.';
  end if;

  if char_length(v_name) < 3 then
    raise exception 'Informe seu nome completo.';
  end if;

  if char_length(v_name) > 60 then
    raise exception 'O nome deve ter até 60 caracteres.';
  end if;

  if v_apartment is not null and char_length(v_apartment) > 20 then
    raise exception 'O apartamento deve ter até 20 caracteres.';
  end if;

  if v_block is not null and char_length(v_block) > 20 then
    raise exception 'O bloco deve ter até 20 caracteres.';
  end if;

  if v_phone is not null and char_length(v_phone) > 30 then
    raise exception 'O telefone deve ter até 30 caracteres.';
  end if;

  select email into v_email from auth.users where id = v_user;

  insert into public.profiles (id, name, email, apartment, block, phone, updated_at)
  values (v_user, v_name, v_email, v_apartment, v_block, v_phone, now())
  on conflict (id) do update set
    name = excluded.name,
    email = excluded.email,
    apartment = excluded.apartment,
    block = excluded.block,
    phone = excluded.phone,
    updated_at = now()
  returning * into v_result;

  return v_result;
end;
$$;

revoke all on function public.save_my_profile(text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.save_my_profile(text, text, text, text)
  to authenticated;

-- ---------- 5. Excluir minha conta ----------

drop function if exists public.delete_my_account();

create or replace function public.delete_my_account()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Faça login para excluir a conta.';
  end if;

  -- Apaga o usuário do Auth; perfis e reservas são removidos em cascata.
  delete from auth.users where id = v_user;
  return true;
end;
$$;

revoke all on function public.delete_my_account()
  from public, anon, authenticated;
grant execute on function public.delete_my_account()
  to authenticated;

-- ---------- 6. Leitura das reservas (somente logados) ----------

alter table public.reservations enable row level security;

drop policy if exists "reservas visiveis para todos" on public.reservations;
drop policy if exists "reservas visiveis para autenticados" on public.reservations;

create policy "reservas visiveis para autenticados"
  on public.reservations
  for select
  to authenticated
  using (true);

revoke all on table public.reservations from anon, authenticated;
grant select on table public.reservations to authenticated;

-- ---------- 5. Criar reserva (somente logado) ----------

drop function if exists public.create_reservation(date, text, text, text, integer, text);

create or replace function public.create_reservation(
  p_date date,
  p_name text,
  p_apartment text,
  p_phone text default '',
  p_guests integer default 1,
  p_notes text default ''
)
returns public.reservations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_profile_name text;
  v_name text := btrim(coalesce(p_name, ''));
  v_apartment text := btrim(coalesce(p_apartment, ''));
  v_phone text := btrim(coalesce(p_phone, ''));
  v_notes text := btrim(coalesce(p_notes, ''));
  v_result public.reservations;
begin
  if v_user is null then
    raise exception 'Faça login para reservar.';
  end if;

  -- O nome exibido vem do perfil do usuário logado (evita se passar por outro morador)
  select p.name into v_profile_name from public.profiles p where p.id = v_user;
  if v_profile_name is not null and btrim(v_profile_name) <> '' then
    v_name := btrim(v_profile_name);
  end if;

  if p_date is null then
    raise exception 'Informe uma data válida.';
  end if;

  if p_date < v_today then
    raise exception 'Não é possível reservar uma data que já passou.';
  end if;

  if char_length(v_name) < 3 then
    raise exception 'Informe o nome com pelo menos 3 letras.';
  end if;

  if char_length(v_apartment) < 1 then
    raise exception 'Informe o apartamento.';
  end if;

  if p_guests is null or p_guests < 1 or p_guests > 40 then
    raise exception 'O número de pessoas deve estar entre 1 e 40.';
  end if;

  if char_length(v_name) > 60
     or char_length(v_apartment) > 20
     or char_length(v_phone) > 30
     or char_length(v_notes) > 120 then
    raise exception 'Algum campo ultrapassou o limite de caracteres.';
  end if;

  insert into public.reservations (date, name, apartment, phone, guests, notes, user_id)
  values (p_date, v_name, v_apartment, v_phone, p_guests, v_notes, v_user)
  returning * into v_result;

  return v_result;
exception
  when unique_violation then
    raise exception 'Este dia já está reservado. Escolha outra data.';
end;
$$;

revoke all on function public.create_reservation(date, text, text, text, integer, text)
  from public, anon, authenticated;
grant execute on function public.create_reservation(date, text, text, text, integer, text)
  to authenticated;

-- ---------- 6. Cancelar reserva (somente o dono) ----------

drop function if exists public.cancel_reservation(uuid, text, text);
drop function if exists public.cancel_reservation(uuid);

create or replace function public.cancel_reservation(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_reservation public.reservations;
begin
  if v_user is null then
    raise exception 'Faça login para cancelar.';
  end if;

  select * into v_reservation from public.reservations where id = p_id;

  if not found then
    raise exception 'Esta reserva não existe mais.';
  end if;

  if v_reservation.user_id is null or v_reservation.user_id <> v_user then
    raise exception 'Você só pode cancelar suas próprias reservas.';
  end if;

  delete from public.reservations where id = p_id;
  return true;
end;
$$;

revoke all on function public.cancel_reservation(uuid)
  from public, anon, authenticated;
grant execute on function public.cancel_reservation(uuid)
  to authenticated;

-- ---------- 7. Conferência ----------

select table_name, 'tabela' as tipo
from information_schema.tables
where table_schema = 'public' and table_name in ('reservations', 'profiles')
union all
select routine_name, 'função'
from information_schema.routines
where routine_schema = 'public'
  and routine_name in ('create_reservation', 'cancel_reservation', 'handle_new_user');

-- ============================================================
-- Área Gourmet · Administração e aprovação de moradores
-- ------------------------------------------------------------
-- Execute este script no SQL Editor do Supabase.
-- Pode ser executado novamente (a aprovação em massa acontece
-- apenas uma vez).
--
-- O que ele faz:
--   • cria os papéis "admin" e "resident" e os status
--     "pending", "approved" e "rejected";
--   • aprova as contas que já existiam (para ninguém perder acesso);
--   • define brunosilveira@grupoemon.com.br como administrador;
--   • novos cadastros nascem pendentes e precisam de aprovação;
--   • bloqueia reservas de usuários não aprovados;
--   • cria as funções do módulo de administração.
-- ============================================================

-- ---------- 1. Papéis e status ----------

alter table public.profiles add column if not exists role text not null default 'resident';
alter table public.profiles add column if not exists status text not null default 'pending';

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('admin', 'resident'));

alter table public.profiles drop constraint if exists profiles_status_check;
alter table public.profiles add constraint profiles_status_check
  check (status in ('pending', 'approved', 'rejected'));

create index if not exists profiles_status_idx on public.profiles (status);

-- ---------- 2. Aprova as contas existentes (uma única vez) ----------

create table if not exists public.app_migrations (
  name text primary key,
  applied_at timestamptz not null default now()
);

revoke all on table public.app_migrations from anon, authenticated;

-- Garante perfil para usuários do Auth que ainda não tenham linha
insert into public.profiles (id, name, email)
select
  id,
  coalesce(nullif(btrim(raw_user_meta_data->>'name'), ''), split_part(coalesce(email, ''), '@', 1)),
  email
from auth.users
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1 from public.app_migrations where name = 'admin_roles_v1'
  ) then
    -- Contas criadas antes da aprovação passam a ser aprovadas
    update public.profiles set status = 'approved';
    insert into public.app_migrations (name) values ('admin_roles_v1');
  end if;
end;
$$;

-- Administrador definido pelo e-mail
update public.profiles
set role = 'admin', status = 'approved', updated_at = now()
where lower(email) = lower('brunosilveira@grupoemon.com.br');

-- ---------- 3. Novos usuários ----------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_email constant text := 'brunosilveira@grupoemon.com.br';
  v_is_admin boolean := lower(coalesce(new.email, '')) = lower(v_admin_email);
begin
  insert into public.profiles (id, name, email, role, status)
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data->>'name'), ''), split_part(coalesce(new.email, ''), '@', 1)),
    new.email,
    case when v_is_admin then 'admin' else 'resident' end,
    case when v_is_admin then 'approved' else 'pending' end
  )
  on conflict (id) do update set email = excluded.email;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- 4. Funções de verificação ----------

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role = 'admin'
      and status = 'approved'
  );
$$;

create or replace function public.is_approved()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and status = 'approved'
  );
$$;

revoke all on function public.is_admin() from public, anon, authenticated;
revoke all on function public.is_approved() from public, anon, authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_approved() to authenticated;

-- ---------- 5. Perfis: leitura ----------

alter table public.profiles enable row level security;

drop policy if exists "perfil proprio select" on public.profiles;
create policy "perfil proprio select"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id or public.is_admin());

drop policy if exists "perfil proprio update" on public.profiles;
drop policy if exists "perfil proprio insert" on public.profiles;

revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;

-- ---------- 6. Reservas: somente aprovados ----------

alter table public.reservations enable row level security;

drop policy if exists "reservas visiveis para todos" on public.reservations;
drop policy if exists "reservas visiveis para autenticados" on public.reservations;

create policy "reservas visiveis para autenticados"
  on public.reservations
  for select
  to authenticated
  using (public.is_approved());

revoke all on table public.reservations from anon, authenticated;
grant select on table public.reservations to authenticated;

-- ---------- 7. Criar reserva (somente aprovado) ----------

drop function if exists public.create_reservation(date, text, text, text, integer, text);

create or replace function public.create_reservation(
  p_date date,
  p_name text,
  p_apartment text,
  p_phone text default '',
  p_guests integer default 1,
  p_notes text default ''
)
returns public.reservations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_profile_name text;
  v_name text := btrim(coalesce(p_name, ''));
  v_apartment text := btrim(coalesce(p_apartment, ''));
  v_phone text := btrim(coalesce(p_phone, ''));
  v_notes text := btrim(coalesce(p_notes, ''));
  v_result public.reservations;
begin
  if v_user is null then
    raise exception 'Faça login para reservar.';
  end if;

  if not public.is_approved() then
    raise exception 'Sua conta ainda não foi aprovada pelo administrador.';
  end if;

  select p.name into v_profile_name from public.profiles p where p.id = v_user;
  if v_profile_name is not null and btrim(v_profile_name) <> '' then
    v_name := btrim(v_profile_name);
  end if;

  if p_date is null then
    raise exception 'Informe uma data válida.';
  end if;

  if p_date < v_today then
    raise exception 'Não é possível reservar uma data que já passou.';
  end if;

  if char_length(v_name) < 3 then
    raise exception 'Informe o nome com pelo menos 3 letras.';
  end if;

  if char_length(v_apartment) < 1 then
    raise exception 'Informe o apartamento.';
  end if;

  if p_guests is null or p_guests < 1 or p_guests > 40 then
    raise exception 'O número de pessoas deve estar entre 1 e 40.';
  end if;

  if char_length(v_name) > 60
     or char_length(v_apartment) > 20
     or char_length(v_phone) > 30
     or char_length(v_notes) > 120 then
    raise exception 'Algum campo ultrapassou o limite de caracteres.';
  end if;

  insert into public.reservations (date, name, apartment, phone, guests, notes, user_id)
  values (p_date, v_name, v_apartment, v_phone, p_guests, v_notes, v_user)
  returning * into v_result;

  return v_result;
exception
  when unique_violation then
    raise exception 'Este dia já está reservado. Escolha outra data.';
end;
$$;

revoke all on function public.create_reservation(date, text, text, text, integer, text)
  from public, anon, authenticated;
grant execute on function public.create_reservation(date, text, text, text, integer, text)
  to authenticated;

-- ---------- 8. Cancelar reserva (somente aprovado e dono) ----------

drop function if exists public.cancel_reservation(uuid, text, text);
drop function if exists public.cancel_reservation(uuid);

create or replace function public.cancel_reservation(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_reservation public.reservations;
begin
  if v_user is null then
    raise exception 'Faça login para cancelar.';
  end if;

  if not public.is_approved() then
    raise exception 'Sua conta ainda não foi aprovada pelo administrador.';
  end if;

  select * into v_reservation from public.reservations where id = p_id;

  if not found then
    raise exception 'Esta reserva não existe mais.';
  end if;

  if v_reservation.user_id is null or v_reservation.user_id <> v_user then
    raise exception 'Você só pode cancelar suas próprias reservas.';
  end if;

  delete from public.reservations where id = p_id;
  return true;
end;
$$;

revoke all on function public.cancel_reservation(uuid)
  from public, anon, authenticated;
grant execute on function public.cancel_reservation(uuid)
  to authenticated;

-- ---------- 9. Administração ----------

create or replace function public.admin_set_user_status(
  p_id uuid,
  p_status text
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := auth.uid();
  v_result public.profiles;
begin
  if not public.is_admin() then
    raise exception 'Acesso restrito a administradores.';
  end if;

  if p_id = v_admin then
    raise exception 'Você não pode alterar o próprio acesso.';
  end if;

  if p_status not in ('pending', 'approved', 'rejected') then
    raise exception 'Status inválido.';
  end if;

  update public.profiles
  set status = p_status, updated_at = now()
  where id = p_id
  returning * into v_result;

  if not found then
    raise exception 'Usuário não encontrado.';
  end if;

  return v_result;
end;
$$;

revoke all on function public.admin_set_user_status(uuid, text)
  from public, anon, authenticated;
grant execute on function public.admin_set_user_status(uuid, text)
  to authenticated;

create or replace function public.admin_set_user_role(
  p_id uuid,
  p_role text
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := auth.uid();
  v_result public.profiles;
begin
  if not public.is_admin() then
    raise exception 'Acesso restrito a administradores.';
  end if;

  if p_id = v_admin then
    raise exception 'Você não pode alterar o próprio papel.';
  end if;

  if p_role not in ('admin', 'resident') then
    raise exception 'Papel inválido.';
  end if;

  update public.profiles
  set role = p_role, updated_at = now()
  where id = p_id
  returning * into v_result;

  if not found then
    raise exception 'Usuário não encontrado.';
  end if;

  return v_result;
end;
$$;

revoke all on function public.admin_set_user_role(uuid, text)
  from public, anon, authenticated;
grant execute on function public.admin_set_user_role(uuid, text)
  to authenticated;

-- ---------- 10. Conferência ----------

select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'profiles'
  and column_name in ('role', 'status')
order by column_name;

select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name in ('is_admin', 'is_approved', 'admin_set_user_status', 'admin_set_user_role')
order by routine_name;
