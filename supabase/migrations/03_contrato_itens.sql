-- Contratos — Migration 03
-- Itens do contrato: snapshot independente de oportunidade_itens/produtos_servicos.
-- Espelha exatamente o padrão já validado em crm.oportunidade_itens
-- (mesma escala decimal, mesmos checks, mesmo trigger de integridade de empresa_id).

create table crm.contrato_itens (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references crm.empresas(id) on delete cascade,
  contrato_id uuid not null references crm.contratos(id) on delete cascade,
  -- Sem cascade: excluir um produto do catálogo NUNCA pode apagar o histórico
  -- comercial de um contrato já formalizado (descricao/valores já estão
  -- congelados nesta linha, independentes do produto continuar existindo).
  produto_id uuid references crm.produtos_servicos(id),
  descricao text,
  quantidade numeric(10,2) not null default 1,
  valor_tabela_unitario numeric(12,2) not null,
  valor_negociado_unitario numeric(12,2) not null,
  desconto_unitario numeric(12,2) not null default 0,
  valor_total numeric(12,2),
  observacao text,
  created_at timestamptz not null default now(),
  constraint contrato_itens_quantidade_check check (quantidade > 0),
  constraint contrato_itens_valor_tabela_unitario_check check (valor_tabela_unitario >= 0),
  constraint contrato_itens_valor_negociado_unitario_check check (valor_negociado_unitario >= 0),
  constraint contrato_itens_desconto_unitario_check check (desconto_unitario >= 0)
);

create index idx_contrato_itens_contrato_id on crm.contrato_itens (contrato_id);
create index idx_contrato_itens_empresa_id on crm.contrato_itens (empresa_id);

-- Mesma técnica de crm.trg_before_oportunidade_item(): valida que o item
-- pertence à mesma empresa do contrato-pai (empresa_id não pode ser
-- "escolhido" livremente pelo cliente da API) e calcula valor_total no servidor,
-- nunca confiando em valor enviado pelo chamador.
create function crm.trg_before_contrato_item()
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
    raise exception 'Item pertence a um contrato de outra empresa (integridade violada).';
  end if;

  -- Congela os itens junto com o contrato: depois de validado, só quem tem
  -- permissão de administrar contratos pode mexer (mesmo critério do trigger
  -- crm.bloquear_edicao_contrato_validado, aplicado aqui à tabela filha).
  if v_status_contrato = 'validado'
     and not crm.tem_permissao(auth.uid(), v_empresa_contrato, 'contratos', 'administrar') then
    raise exception 'Este contrato já foi validado. Os itens não podem mais ser alterados.';
  end if;

  new.valor_total := greatest(
    new.quantidade * new.valor_negociado_unitario - coalesce(new.desconto_unitario, 0),
    0
  );
  return new;
end;
$$;

create trigger trg_before_contrato_item
  before insert or update on crm.contrato_itens
  for each row execute function crm.trg_before_contrato_item();

-- Mesmo bloqueio para DELETE (evita apagar item de contrato já validado).
create function crm.trg_before_delete_contrato_item()
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
    raise exception 'Este contrato já foi validado. Os itens não podem mais ser removidos.';
  end if;
  return old;
end;
$$;

create trigger trg_before_delete_contrato_item
  before delete on crm.contrato_itens
  for each row execute function crm.trg_before_delete_contrato_item();
