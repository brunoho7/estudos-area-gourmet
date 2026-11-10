-- ============================================================
-- Área Gourmet · Schema do Supabase
-- ------------------------------------------------------------
-- Como usar:
--   1. Crie um projeto no Supabase (https://supabase.com).
--   2. Abra "SQL Editor" > "New query".
--   3. Cole TODO este arquivo e clique em "Run".
--   4. Em "Project Settings > API", copie a URL do projeto e a
--      chave "anon public" para o arquivo config.js do site.
--
-- A chave "anon" é pública por design. A proteção fica aqui:
-- leitura liberada, escrita apenas pelas funções abaixo e
-- remoção apenas com nome + apartamento corretos.
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- Tabela ----------

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

alter table public.reservations enable row level security;

drop policy if exists "reservas visiveis para todos" on public.reservations;
create policy "reservas visiveis para todos"
  on public.reservations
  for select
  to anon, authenticated
  using (true);

-- O público só pode LER. Inserir e apagar somente pelas funções.
revoke all on table public.reservations from anon, authenticated;
grant select on table public.reservations to anon, authenticated;
grant usage on schema public to anon, authenticated;

-- ---------- Normalização de texto (ignora acentos, espaços e hífens) ----------

create or replace function public.normalize_text(p_value text)
returns text
language sql
immutable
set search_path = public
as $$
  select lower(
    translate(
      btrim(coalesce(p_value, '')),
      'ÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑáàâãäåéèêëíìîïóòôõöúùûüçñ',
      'AAAAAAEEEEIIIIOOOOOUUUUCNaaaaaaeeeeiiiiooooouuuucn'
    )
  );
$$;

create or replace function public.norm_name(p_value text)
returns text
language sql
immutable
as $$
  select regexp_replace(public.normalize_text(p_value), '\s+', ' ', 'g');
$$;

create or replace function public.norm_apartment(p_value text)
returns text
language sql
immutable
as $$
  select regexp_replace(public.normalize_text(p_value), '[\s.\-]', '', 'g');
$$;

-- ---------- Criar reserva ----------

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
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_name text := btrim(coalesce(p_name, ''));
  v_apartment text := btrim(coalesce(p_apartment, ''));
  v_phone text := btrim(coalesce(p_phone, ''));
  v_notes text := btrim(coalesce(p_notes, ''));
  v_result public.reservations;
begin
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

  insert into public.reservations (date, name, apartment, phone, guests, notes)
  values (p_date, v_name, v_apartment, v_phone, p_guests, v_notes)
  returning * into v_result;

  return v_result;
exception
  when unique_violation then
    raise exception 'Este dia já está reservado. Escolha outra data.';
end;
$$;

revoke all on function public.create_reservation(date, text, text, text, integer, text) from public;
revoke all on function public.create_reservation(date, text, text, text, integer, text) from anon, authenticated;
grant execute on function public.create_reservation(date, text, text, text, integer, text) to anon, authenticated;

-- ---------- Cancelar reserva ----------

drop function if exists public.cancel_reservation(uuid, text, text);

create or replace function public.cancel_reservation(
  p_id uuid,
  p_name text,
  p_apartment text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservation public.reservations;
begin
  select * into v_reservation from public.reservations where id = p_id;

  if not found then
    raise exception 'Esta reserva não existe mais.';
  end if;

  if public.norm_name(v_reservation.name) <> public.norm_name(p_name)
     or public.norm_apartment(v_reservation.apartment) <> public.norm_apartment(p_apartment) then
    raise exception 'Nome ou apartamento não conferem com esta reserva.';
  end if;

  delete from public.reservations where id = p_id;
  return true;
end;
$$;

revoke all on function public.cancel_reservation(uuid, text, text) from public;
revoke all on function public.cancel_reservation(uuid, text, text) from anon, authenticated;
grant execute on function public.cancel_reservation(uuid, text, text) to anon, authenticated;

-- ---------- Conferência rápida ----------
-- Deve mostrar a tabela e as duas funções:
select table_name, 'tabela' as tipo from information_schema.tables
where table_schema = 'public' and table_name = 'reservations'
union all
select routine_name, 'função' from information_schema.routines
where routine_schema = 'public' and routine_name in ('create_reservation', 'cancel_reservation');
