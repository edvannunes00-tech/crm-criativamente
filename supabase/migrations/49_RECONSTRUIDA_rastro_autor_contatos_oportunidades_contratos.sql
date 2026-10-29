-- RECONSTRUÇÃO (2026-10-12): colunas e função confirmadas por introspecção direta do banco
-- (information_schema + pg_get_functiondef). Fiel ao estado atual.

alter table crm.contatos add column if not exists criado_por uuid references crm.usuarios(id);
alter table crm.contatos add column if not exists atualizado_por uuid references crm.usuarios(id);
alter table crm.oportunidades add column if not exists criado_por uuid references crm.usuarios(id);
alter table crm.oportunidades add column if not exists atualizado_por uuid references crm.usuarios(id);
alter table crm.contratos add column if not exists criado_por uuid references crm.usuarios(id);
alter table crm.contratos add column if not exists atualizado_por uuid references crm.usuarios(id);

create or replace function crm.trg_rastro_autor()
returns trigger
language plpgsql
security definer
set search_path to 'crm', 'public'
as $function$
begin
  if tg_op = 'INSERT' then
    new.criado_por := auth.uid();
    new.atualizado_por := auth.uid();
  elsif tg_op = 'UPDATE' then
    new.criado_por := old.criado_por;
    new.atualizado_por := auth.uid();
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_rastro_autor_contatos on crm.contatos;
create trigger trg_rastro_autor_contatos
  before insert or update on crm.contatos
  for each row execute function crm.trg_rastro_autor();

drop trigger if exists trg_rastro_autor_oportunidades on crm.oportunidades;
create trigger trg_rastro_autor_oportunidades
  before insert or update on crm.oportunidades
  for each row execute function crm.trg_rastro_autor();

drop trigger if exists trg_rastro_autor_contratos on crm.contratos;
create trigger trg_rastro_autor_contratos
  before insert or update on crm.contratos
  for each row execute function crm.trg_rastro_autor();
