-- ============================================================
-- Área Gourmet · Migração: dados do perfil
-- ------------------------------------------------------------
-- Execute este script no SQL Editor do Supabase.
-- Ele adiciona apartamento, bloco, telefone e as funções de
-- salvar/excluir o próprio perfil. Pode ser executado de novo.
-- ============================================================

-- ---------- 1. Novos campos ----------

alter table public.profiles add column if not exists apartment text;
alter table public.profiles add column if not exists block text;
alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists updated_at timestamptz not null default now();

alter table public.profiles drop constraint if exists profiles_apartment_len;
alter table public.profiles add constraint profiles_apartment_len
  check (apartment is null or char_length(apartment) <= 20);

alter table public.profiles drop constraint if exists profiles_block_len;
alter table public.profiles add constraint profiles_block_len
  check (block is null or char_length(block) <= 20);

alter table public.profiles drop constraint if exists profiles_phone_len;
alter table public.profiles add constraint profiles_phone_len
  check (phone is null or char_length(phone) <= 30);

-- ---------- 2. Permissões ----------

alter table public.profiles enable row level security;

drop policy if exists "perfil proprio select" on public.profiles;
create policy "perfil proprio select"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

drop policy if exists "perfil proprio update" on public.profiles;
drop policy if exists "perfil proprio insert" on public.profiles;

revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;

-- ---------- 3. Salvar meu perfil ----------

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

-- ---------- 4. Excluir minha conta ----------

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

  delete from auth.users where id = v_user;
  return true;
end;
$$;

revoke all on function public.delete_my_account()
  from public, anon, authenticated;
grant execute on function public.delete_my_account()
  to authenticated;

-- ---------- 5. Conferência ----------

select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'profiles'
  and column_name in ('apartment', 'block', 'phone', 'updated_at')
order by column_name;

select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name in ('save_my_profile', 'delete_my_account')
order by routine_name;
