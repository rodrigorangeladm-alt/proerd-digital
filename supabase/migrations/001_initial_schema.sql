-- PROERD DIGITAL PoC 0.1
-- Execute no SQL Editor do Supabase em um projeto NOVO e exclusivo para testes.
-- Dados e identidades usados na PoC devem ser fictícios.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default 'Usuário de teste',
  role text not null default 'instructor' check (role in ('admin','instructor')),
  rank text,
  created_at timestamptz not null default now()
);

create table if not exists public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  region text not null,
  school_type text not null check (school_type in ('Pública','Privada','Federal')),
  address text,
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.demands (
  id uuid primary key default gen_random_uuid(),
  protocol text not null unique default ('PD-' || to_char(now(),'YYYY') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))),
  school_id uuid not null references public.schools(id),
  class_name text not null,
  activity_type text not null,
  preferred_date date,
  status text not null default 'Pendente' check (status in ('Pendente','Aguardando aceite','Aceita','Concluída','Cancelada')),
  assigned_to uuid references public.profiles(id),
  refusal_reason text,
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  demand_id uuid not null references public.demands(id),
  instructor_id uuid not null default auth.uid() references public.profiles(id),
  performed_on date not null default current_date,
  students_present integer not null default 0 check (students_present >= 0),
  result text not null check (result in ('Realizada integralmente','Realizada parcialmente','Não realizada')),
  notes text,
  status text not null default 'Pendente de validação' check (status in ('Pendente de validação','Validada','Devolvida')),
  validation_note text,
  validated_by uuid references public.profiles(id),
  validated_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_events (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id),
  table_name text not null,
  record_id uuid,
  action text not null,
  occurred_at timestamptz not null default now(),
  details jsonb not null default '{}'::jsonb
);

create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.profiles(id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name','Usuário de teste'), 'instructor')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.write_audit_event()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare rid uuid;
begin
  if tg_op = 'DELETE' then rid := old.id; else rid := new.id; end if;
  insert into public.audit_events(actor_id, table_name, record_id, action)
  values(auth.uid(), tg_table_name, rid, tg_op);
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

drop trigger if exists audit_schools on public.schools;
create trigger audit_schools after insert or update or delete on public.schools
for each row execute procedure public.write_audit_event();
drop trigger if exists audit_demands on public.demands;
create trigger audit_demands after insert or update or delete on public.demands
for each row execute procedure public.write_audit_event();
drop trigger if exists audit_activities on public.activities;
create trigger audit_activities after insert or update or delete on public.activities
for each row execute procedure public.write_audit_event();

alter table public.profiles enable row level security;
alter table public.schools enable row level security;
alter table public.demands enable row level security;
alter table public.activities enable row level security;
alter table public.audit_events enable row level security;

-- Profiles: cada usuário lê o próprio perfil; administrador consulta todos.
create policy "profile_self_or_admin_read" on public.profiles
for select to authenticated using (id = auth.uid() or public.is_admin());

-- Schools: usuário autenticado consulta; somente administrador cadastra/altera.
create policy "schools_read_authenticated" on public.schools
for select to authenticated using (true);
create policy "schools_admin_insert" on public.schools
for insert to authenticated with check (public.is_admin() and created_by = auth.uid());
create policy "schools_admin_update" on public.schools
for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "schools_admin_delete" on public.schools
for delete to authenticated using (public.is_admin());

-- Demands: administrador vê e administra todas; instrutor vê apenas as designadas a ele.
create policy "demands_admin_or_assignee_read" on public.demands
for select to authenticated using (public.is_admin() or assigned_to = auth.uid());
create policy "demands_admin_insert" on public.demands
for insert to authenticated with check (public.is_admin() and created_by = auth.uid());
create policy "demands_admin_update" on public.demands
for update to authenticated using (public.is_admin()) with check (public.is_admin());
-- A resposta do instrutor é feita por função controlada, evitando que a política
-- de atualização permita alterar outros campos da demanda.
create or replace function public.respond_to_demand(
  p_demand_id uuid,
  p_accept boolean,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Autenticação obrigatória.';
  end if;

  update public.demands
  set status = case when p_accept then 'Aceita' else 'Pendente' end,
      assigned_to = case when p_accept then assigned_to else null end,
      refusal_reason = case when p_accept then null else nullif(trim(p_reason), '') end,
      updated_at = now()
  where id = p_demand_id
    and assigned_to = auth.uid()
    and status = 'Aguardando aceite';

  if not found then
    raise exception 'Demanda não encontrada ou não está disponível para sua resposta.';
  end if;

  if not p_accept and nullif(trim(p_reason), '') is null then
    raise exception 'A justificativa da recusa é obrigatória.';
  end if;
end;
$$;

-- Activities: instrutor registra atividade em demanda aceita que lhe pertence.
create policy "activities_admin_or_owner_read" on public.activities
for select to authenticated using (public.is_admin() or instructor_id = auth.uid());
create policy "instructor_insert_activity" on public.activities
for insert to authenticated with check (
  instructor_id = auth.uid()
  and exists(select 1 from public.demands d where d.id = demand_id and d.assigned_to = auth.uid() and d.status = 'Aceita')
);
create policy "admin_validate_activity" on public.activities
for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Auditoria: somente administrador pode consultar; inserção é feita por trigger.
create policy "audit_admin_read" on public.audit_events
for select to authenticated using (public.is_admin());

grant usage on schema public to authenticated;
grant select on public.profiles to authenticated;
grant select, insert, update, delete on public.schools to authenticated;
grant select, insert, update on public.demands to authenticated;
grant execute on function public.respond_to_demand(uuid, boolean, text) to authenticated;
grant select, insert, update on public.activities to authenticated;
grant select on public.audit_events to authenticated;
grant usage, select on sequence public.audit_events_id_seq to authenticated;

-- IMPORTANTE: depois de criar sua conta no app, promova SOMENTE sua conta de teste
-- a administrador pelo SQL Editor, substituindo pelo e-mail usado no cadastro:
-- update public.profiles p set role = 'admin'
-- from auth.users u where p.id = u.id and u.email = 'SEU-EMAIL-DE-TESTE';
