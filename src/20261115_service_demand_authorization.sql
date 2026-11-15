-- Fluxo de solicitacao de servico pelo instrutor com autorizacao administrativa.
-- Execute no SQL Editor do Supabase apos as migracoes atuais.

begin;

alter table public.demands
  add column if not exists requested_by_name text,
  add column if not exists school_contact text,
  add column if not exists preferred_time text,
  add column if not exists estimated_students integer,
  add column if not exists request_notes text,
  add column if not exists reviewed_by uuid references public.profiles(id),
  add column if not exists reviewed_at timestamptz,
  add column if not exists administrative_note text;

-- Remove checks antigos de status para permitir os novos estados do fluxo.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.demands'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.demands drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.demands add constraint demands_status_check
check (status in (
  'Pendente','Aguardando aceite','Aceita','Concluída','Cancelada',
  'Aguardando autorização','Autorizada','Indeferida','Devolvida para correção'
));

drop policy if exists "demands_admin_or_assignee_read" on public.demands;
drop policy if exists "demands_admin_or_requester_read" on public.demands;
drop policy if exists "demands_admin_assignee_or_requester_read" on public.demands;
create policy "demands_admin_assignee_or_requester_read"
on public.demands for select to authenticated
using (public.is_admin() or assigned_to = auth.uid() or created_by = auth.uid());

create or replace function public.request_service_demand(
  p_school_id uuid,
  p_class_name text,
  p_activity_type text,
  p_preferred_date date,
  p_preferred_time text default null,
  p_estimated_students integer default null,
  p_requested_by_name text default null,
  p_school_contact text default null,
  p_request_notes text default null
)
returns uuid language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Autenticacao obrigatoria.'; end if;
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'instructor') then
    raise exception 'Somente instrutores podem abrir solicitacoes por este fluxo.';
  end if;
  if not exists (select 1 from public.schools where id = p_school_id) then
    raise exception 'Escola nao encontrada.';
  end if;
  if nullif(trim(p_class_name), '') is null or nullif(trim(p_activity_type), '') is null then
    raise exception 'Informe a turma e o tipo de atividade.';
  end if;
  if p_estimated_students is not null and p_estimated_students < 0 then
    raise exception 'A quantidade estimada nao pode ser negativa.';
  end if;

  insert into public.demands (
    school_id,class_name,activity_type,preferred_date,status,created_by,
    requested_by_name,school_contact,preferred_time,estimated_students,request_notes
  ) values (
    p_school_id,trim(p_class_name),trim(p_activity_type),p_preferred_date,
    'Aguardando autorização',auth.uid(),nullif(trim(p_requested_by_name),''),
    nullif(trim(p_school_contact),''),nullif(trim(p_preferred_time),''),
    p_estimated_students,nullif(trim(p_request_notes),'')
  ) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.review_service_demand(
  p_demand_id uuid,
  p_decision text,
  p_administrative_note text default null
)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Somente a administracao pode analisar esta solicitacao.';
  end if;
  if p_decision not in ('Autorizada','Indeferida','Devolvida para correção') then
    raise exception 'Decisao invalida.';
  end if;
  if p_decision in ('Indeferida','Devolvida para correção')
     and nullif(trim(p_administrative_note),'') is null then
    raise exception 'Informe a justificativa da decisao.';
  end if;

  update public.demands
  set status = p_decision,
      assigned_to = case when p_decision = 'Autorizada' then created_by else null end,
      reviewed_by = auth.uid(), reviewed_at = now(),
      administrative_note = nullif(trim(p_administrative_note),''),
      updated_at = now()
  where id = p_demand_id and status = 'Aguardando autorização';

  if not found then raise exception 'Solicitacao nao encontrada ou ja analisada.'; end if;
end;
$$;

drop policy if exists "instructor_insert_activity" on public.activities;
create policy "instructor_insert_activity"
on public.activities for insert to authenticated
with check (
  instructor_id = auth.uid()
  and exists (
    select 1 from public.demands d
    where d.id = demand_id and d.assigned_to = auth.uid()
      and d.status in ('Aceita','Autorizada')
  )
);

grant execute on function public.request_service_demand(
  uuid,text,text,date,text,integer,text,text,text
) to authenticated;
grant execute on function public.review_service_demand(uuid,text,text) to authenticated;

commit;
