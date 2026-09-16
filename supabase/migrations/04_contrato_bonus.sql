-- Contratos — Migration 04
-- Bônus concedidos ao cliente. Tabela própria (não é linha em contrato_itens
-- com valor zero) porque bônus não é produto vendido e misturar os dois
-- contaminaria qualquer soma de valores dos itens comerciais.
-- produto_id fica nullable/reservado para uma futura ligação com o catálogo
-- (ex.: "bônus = N unidades do produto X"), sem exigir migration nova.

create table crm.contrato_bonus (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references crm.empresas(id) on delete cascade,
  contrato_id uuid not null references crm.contratos(id) on delete cascade,
  produto_id uuid references crm.produtos_servicos(id),
  descricao text not null,
  quantidade numeric(10,2),
  observacao text,
  created_at timestamptz not null default now(),
  constraint contrato_bonus_quantidade_check check (quantidade is null or quantidade > 0)
);

create index idx_contrato_bonus_contrato_id on crm.contrato_bonus (contrato_id);
create index idx_contrato_bonus_empresa_id on crm.contrato_bonus (empresa_id);

create function crm.trg_before_contrato_bonus()
returns trigger
language plpgsql
security definer
set search_path to 'crm', 'public'
as $$
declare
  v_empresa_contrato uuid;
  v_status_contrato text;
begin
  select empresa_id, status into v_empresa_contrato, v_status_contrato
  from crm.contratos where id = new.contrato_id;

  if v_empresa_contrato is distinct from new.empresa_id then
    raise exception 'Bônus pertence a um contrato de outra empresa (integridade violada).';
  end if;

  if v_status_contrato = 'validado'
     and not crm.tem_permissao(auth.uid(), v_empresa_contrato, 'contratos', 'administrar') then
    raise exception 'Este contrato já foi validado. Os bônus não podem mais ser alterados.';
  end if;

  return new;
end;
$$;

create trigger trg_before_contrato_bonus
  before insert or update on crm.contrato_bonus
  for each row execute function crm.trg_before_contrato_bonus();

create function crm.trg_before_delete_contrato_bonus()
returns trigger
language plpgsql
security definer
set search_path to 'crm', 'public'
as $$
declare
  v_status_contrato text;
  v_empresa_contrato uuid;
begin
  select empresa_id, status into v_empresa_contrato, v_status_contrato
  from crm.contratos where id = old.contrato_id;

  if v_status_contrato = 'validado'
     and not crm.tem_permissao(auth.uid(), v_empresa_contrato, 'contratos', 'administrar') then
    raise exception 'Este contrato já foi validado. Os bônus não podem mais ser removidos.';
  end if;
  return old;
end;
$$;

create trigger trg_before_delete_contrato_bonus
  before delete on crm.contrato_bonus
  for each row execute function crm.trg_before_delete_contrato_bonus();
