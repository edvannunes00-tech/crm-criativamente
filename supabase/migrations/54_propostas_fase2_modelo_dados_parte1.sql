-- O esqueleto antigo de crm.propostas (0 linhas, nunca usado em produção) é incompatível
-- com o novo modelo (item único vs. multi-item com snapshot) -- recriado do zero,
-- aprovado explicitamente pelo usuário (sem risco: tabela vazia).
drop trigger if exists trg_propostas_updated_at on crm.propostas;
drop trigger if exists trg_proposta_evento on crm.propostas;
drop function if exists crm.trg_proposta_evento();
drop table if exists crm.propostas cascade;

create table crm.propostas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references crm.empresas(id) on delete cascade,
  contato_id uuid not null references crm.contatos(id),
  oportunidade_id uuid references crm.oportunidades(id),
  contrato_id uuid references crm.contratos(id),
  codigo text,
  titulo text not null,
  status text not null default 'rascunho'
    check (status = any (array['rascunho','enviada','visualizada','aceita','recusada','expirada','cancelada','substituida'])),
  versao_atual integer not null default 1,
  validade_at date,
  introducao text,
  contexto text,
  objetivo text,
  descricao_solucao text,
  condicoes_especiais text,
  proximos_passos text,
  condicao_pagamento_tipo text,
  condicao_pagamento_percentual_entrada numeric,
  forma_pagamento text,
  parcelas_quantidade integer,
  parcelas_periodicidade text,
  parcelas_observacao text,
  valor_tabela_total numeric not null default 0,
  valor_negociado_total numeric not null default 0,
  desconto_total numeric not null default 0,
  enviada_em timestamptz,
  primeira_visualizacao_em timestamptz,
  aceita_em timestamptz,
  recusada_em timestamptz,
  expirada_em timestamptz,
  cancelada_em timestamptz,
  motivo_cancelamento text,
  substituida_por_id uuid references crm.propostas(id),
  criado_por uuid references crm.usuarios(id),
  atualizado_por uuid references crm.usuarios(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table crm.proposta_itens (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references crm.empresas(id) on delete cascade,
  proposta_id uuid not null references crm.propostas(id) on delete cascade,
  produto_id uuid references crm.produtos_servicos(id),
  descricao text,
  quantidade numeric not null default 1,
  valor_tabela_unitario numeric,
  valor_negociado_unitario numeric,
  desconto_unitario numeric default 0,
  valor_total numeric,
  observacao text,
  escopo_objeto text,
  escopo_quantidade_maxima_aulas integer,
  escopo_modalidade_gravacao text,
  escopo_equipamentos text,
  escopo_direcao boolean,
  escopo_edicao text,
  escopo_capas text,
  escopo_plataforma text,
  escopo_pagina_vendas text,
  escopo_certificado text,
  escopo_apostila_material text,
  escopo_legendas text,
  escopo_vinheta text,
  escopo_site text,
  escopo_midia_fisica text,
  escopo_prazo_suporte_meses integer,
  escopo_observacoes text,
  escopo_exclusoes text,
  termos_contratuais text,
  recorrencia_tipo text,
  recorrencia_valor_mensal numeric,
  recorrencia_valor_anual numeric,
  created_at timestamptz not null default now()
);

create table crm.proposta_bonus (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references crm.empresas(id) on delete cascade,
  proposta_id uuid not null references crm.propostas(id) on delete cascade,
  produto_id uuid references crm.produtos_servicos(id),
  descricao text not null,
  quantidade numeric,
  observacao text,
  created_at timestamptz not null default now()
);

create table crm.proposta_versoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references crm.empresas(id) on delete cascade,
  proposta_id uuid not null references crm.propostas(id) on delete cascade,
  versao integer not null,
  documento_id uuid references crm.documentos(id),
  motivo_versao text,
  criado_por uuid references crm.usuarios(id),
  created_at timestamptz not null default now()
);

create table crm.proposta_links (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references crm.empresas(id) on delete cascade,
  proposta_id uuid not null references crm.propostas(id) on delete cascade,
  token_hash text not null unique,
  token_cifrado text,
  status text not null default 'ativo'
    check (status = any (array['ativo','revogado','expirado'])),
  expires_at timestamptz not null,
  created_by uuid references crm.usuarios(id),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references crm.usuarios(id),
  motivo_revogacao text,
  last_access_at timestamptz,
  access_count integer not null default 0,
  respondida_em timestamptz
);

alter table crm.atividades add column if not exists proposta_id uuid references crm.propostas(id);
alter table crm.contratos add column if not exists proposta_origem_id uuid references crm.propostas(id);

create index on crm.propostas (empresa_id);
create index on crm.propostas (contato_id);
create index on crm.propostas (oportunidade_id);
create index on crm.proposta_itens (proposta_id);
create index on crm.proposta_bonus (proposta_id);
create index on crm.proposta_versoes (proposta_id);
create index on crm.proposta_links (proposta_id);
create index on crm.atividades (proposta_id);
