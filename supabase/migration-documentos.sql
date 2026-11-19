-- ============================================================
-- Área Gourmet · Documentos dos moradores
-- ------------------------------------------------------------
-- Execute no SQL Editor do Supabase, depois das migrações de
-- perfil e administração.
--
-- • Cria o bucket privado "documentos" (10 MB por arquivo).
-- • Cada morador pode ter no máximo 2 documentos.
-- • O morador faz CRUD apenas dos próprios documentos.
-- • O administrador enxerga e baixa os documentos de todos.
-- ============================================================

-- ---------- 1. Bucket ----------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documentos',
  'documentos',
  false,
  10485760,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ---------- 2. Tabela de metadados ----------

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  storage_path text not null unique,
  mime_type text,
  size_bytes bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint documents_name_len check (char_length(name) between 1 and 120),
  constraint documents_size_limit check (size_bytes between 0 and 10485760)
);

create index if not exists documents_user_id_idx on public.documents (user_id);

-- ---------- 3. Limite de 2 documentos por morador ----------

create or replace function public.check_document_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_count integer;
begin
  if v_user is null then
    raise exception 'Faça login para gerenciar documentos.';
  end if;

  if not public.is_approved() then
    raise exception 'Sua conta ainda não foi aprovada pelo administrador.';
  end if;

  if tg_op = 'INSERT' then
    if new.user_id <> v_user and not public.is_admin() then
      raise exception 'Você só pode enviar documentos para a própria conta.';
    end if;

    if new.storage_path not like new.user_id::text || '/%' then
      raise exception 'Caminho de armazenamento inválido.';
    end if;

    -- Evita que dois uploads simultâneos passem do limite
    perform pg_advisory_xact_lock(hashtext(new.user_id::text));

    select count(*) into v_count
    from public.documents
    where user_id = new.user_id;

    if v_count >= 2 then
      raise exception 'Você já possui 2 documentos. Exclua um para enviar outro.';
    end if;
  elsif tg_op = 'UPDATE' then
    if not public.is_admin()
       and (new.user_id <> old.user_id or new.storage_path <> old.storage_path) then
      raise exception 'Não é permitido mover o documento para outra conta.';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_check_document_limit on public.documents;
create trigger trg_check_document_limit
  before insert or update on public.documents
  for each row execute function public.check_document_limit();

-- ---------- 4. RLS dos metadados ----------

alter table public.documents enable row level security;

drop policy if exists "documentos_select" on public.documents;
create policy "documentos_select"
  on public.documents
  for select
  to authenticated
  using (
    public.is_approved()
    and (user_id = auth.uid() or public.is_admin())
  );

drop policy if exists "documentos_insert" on public.documents;
create policy "documentos_insert"
  on public.documents
  for insert
  to authenticated
  with check (
    public.is_approved()
    and user_id = auth.uid()
  );

drop policy if exists "documentos_update" on public.documents;
create policy "documentos_update"
  on public.documents
  for update
  to authenticated
  using (
    public.is_approved()
    and (user_id = auth.uid() or public.is_admin())
  )
  with check (
    public.is_approved()
    and (user_id = auth.uid() or public.is_admin())
  );

drop policy if exists "documentos_delete" on public.documents;
create policy "documentos_delete"
  on public.documents
  for delete
  to authenticated
  using (
    public.is_approved()
    and (user_id = auth.uid() or public.is_admin())
  );

revoke all on table public.documents from anon, authenticated;
grant select, insert, update, delete on table public.documents to authenticated;

-- ---------- 5. Políticas do Storage ----------

drop policy if exists "documentos_storage_select" on storage.objects;
create policy "documentos_storage_select"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'documentos'
    and public.is_approved()
    and (owner = auth.uid() or public.is_admin())
  );

drop policy if exists "documentos_storage_insert" on storage.objects;
create policy "documentos_storage_insert"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'documentos'
    and public.is_approved()
    and owner = auth.uid()
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "documentos_storage_update" on storage.objects;
create policy "documentos_storage_update"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'documentos'
    and public.is_approved()
    and owner = auth.uid()
  )
  with check (
    bucket_id = 'documentos'
    and public.is_approved()
    and owner = auth.uid()
  );

drop policy if exists "documentos_storage_delete" on storage.objects;
create policy "documentos_storage_delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'documentos'
    and public.is_approved()
    and (owner = auth.uid() or public.is_admin())
  );

-- ---------- 6. Conferência ----------

select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'documents'
order by ordinal_position;

select id, name, public, file_size_limit
from storage.buckets
where id = 'documentos';
