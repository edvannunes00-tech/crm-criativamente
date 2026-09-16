-- Contratos — Migration 06
-- Snapshot dos dados preenchidos/confirmados pelo cliente no fluxo público.
-- Fica travado (imutável) após confirmado_em, mesmo critério de
-- crm.bloquear_edicao_contrato_validado, aplicado aqui via trigger.
--
-- NÃO atualiza crm.contatos automaticamente — ver aplicado_ao_contato_em/por.

create table crm.contrato_dados_cliente (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references crm.empresas(id) on delete cascade,
  contrato_id uuid not null references crm.contratos(id) on delete cascade,
  -- Sem cascade: um link não é fisicamente apagado (é revogado/expirado),
  -- então o valor default (restrict) é suficiente e evita apagamento acidental.
  link_id uuid not null unique references crm.contrato_links(id),
  nome_completo text,
  cpf_cnpj text,
  telefone text,
  email text,
  endereco_cep text,
  endereco_logradouro text,
  endereco_numero text,
  endereco_complemento text,
  endereco_bairro text,
  endereco_cidade text,
  endereco_estado text,
  preenchido_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  confirmado_em timestamptz,
  aplicado_ao_contato_em timestamptz,
  aplicado_ao_contato_por uuid references crm.usuarios(id),
  constraint contrato_dados_cliente_confirmado_apos_preenchido check (
    confirmado_em is null or confirmado_em >= preenchido_em
  ),
  constraint contrato_dados_cliente_atualizado_apos_preenchido check (
    atualizado_em >= preenchido_em
  ),
  constraint contrato_dados_cliente_aplicado_requer_confirmado check (
    aplicado_ao_contato_em is null or confirmado_em is not null
  )
);

create index idx_contrato_dados_cliente_contrato_id on crm.contrato_dados_cliente (contrato_id);
create index idx_contrato_dados_cliente_empresa_id on crm.contrato_dados_cliente (empresa_id);

create function crm.trg_before_contrato_dados_cliente()
returns trigger
language plpgsql
security definer
set search_path to 'crm', 'public'
as $$
declare
  v_empresa_contrato uuid;
  v_contrato_do_link uuid;
begin
  select empresa_id into v_empresa_contrato from crm.contratos where id = new.contrato_id;
  if v_empresa_contrato is distinct from new.empresa_id then
    raise exception 'Dados de cliente pertencem a um contrato de outra empresa (integridade violada).';
  end if;

  select contrato_id into v_contrato_do_link from crm.contrato_links where id = new.link_id;
  if v_contrato_do_link is distinct from new.contrato_id then
    raise exception 'O link informado não pertence a este contrato.';
  end if;

  if tg_op = 'UPDATE' then
    new.atualizado_em := now();
    if old.confirmado_em is not null
       and not crm.tem_permissao(auth.uid(), old.empresa_id, 'contratos', 'administrar') then
      raise exception 'Estes dados já foram confirmados pelo cliente e não podem mais ser alterados.';
    end if;
  end if;

  return new;
end;
$$;

create trigger trg_before_contrato_dados_cliente
  before insert or update on crm.contrato_dados_cliente
  for each row execute function crm.trg_before_contrato_dados_cliente();
