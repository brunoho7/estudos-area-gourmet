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
