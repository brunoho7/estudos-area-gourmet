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
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "perfil proprio select" on public.profiles;
create policy "perfil proprio select"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

drop policy if exists "perfil proprio update" on public.profiles;
create policy "perfil proprio update"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

grant usage on schema public to anon, authenticated;

revoke all on table public.profiles from anon, authenticated;
grant select, update on table public.profiles to authenticated;

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

-- ---------- 4. Leitura das reservas (somente logados) ----------

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
