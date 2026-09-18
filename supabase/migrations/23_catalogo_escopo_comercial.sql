-- Contratos — Migration 23
-- Estrutura o escopo comercial do catálogo (produtos_servicos) em campos
-- proprios, em vez de uma descricao livre gigante. Replica pro contrato o
-- MESMO padrao de snapshot ja usado pro preco (valor_tabela_unitario /
-- valor_negociado_unitario, congelados no INSERT): o escopo tambem e
-- copiado pra contrato_itens no momento em que o item e criado, e nunca
-- mais muda -- mesmo que o produto no catalogo mude depois.
--
-- CATALOGO ATUAL -> NEGOCIACAO -> CONTRATO -> SNAPSHOT DO ESCOPO -> VERSAO

-- ---------------------------------------------------------------
-- 1) Campos de escopo no catalogo
-- ---------------------------------------------------------------
alter table crm.produtos_servicos
  add column escopo_objeto text,
  add column escopo_quantidade_maxima_aulas integer,
  add column escopo_modalidade_gravacao text,
  add column escopo_equipamentos text,
  add column escopo_direcao boolean not null default false,
  add column escopo_edicao text,
  add column escopo_capas text,
  add column escopo_plataforma text,
  add column escopo_pagina_vendas text,
  add column escopo_certificado text not null default 'nao_incluido',
  add column escopo_apostila_material text not null default 'nao_incluido',
  add column escopo_legendas text not null default 'nao_incluido',
  add column escopo_vinheta text not null default 'nao_incluido',
  add column escopo_site text not null default 'nao_incluido',
  add column escopo_midia_fisica text not null default 'nao_incluido',
  add column escopo_prazo_suporte_meses integer,
  add column escopo_observacoes text,
  add column escopo_exclusoes text;

alter table crm.produtos_servicos
  add constraint produtos_servicos_escopo_modalidade_check check (
    escopo_modalidade_gravacao is null or escopo_modalidade_gravacao in ('remoto', 'presencial', 'hibrido')
  ),
  add constraint produtos_servicos_escopo_certificado_check check (
    escopo_certificado in ('incluido', 'nao_incluido', 'adicional')
  ),
  add constraint produtos_servicos_escopo_apostila_check check (
    escopo_apostila_material in ('incluido', 'nao_incluido', 'adicional')
  ),
  add constraint produtos_servicos_escopo_legendas_check check (
    escopo_legendas in ('incluido', 'nao_incluido', 'adicional')
  ),
  add constraint produtos_servicos_escopo_vinheta_check check (
    escopo_vinheta in ('incluido', 'nao_incluido', 'adicional')
  ),
  add constraint produtos_servicos_escopo_site_check check (
    escopo_site in ('incluido', 'nao_incluido', 'adicional')
  ),
  add constraint produtos_servicos_escopo_midia_check check (
    escopo_midia_fisica in ('incluido', 'nao_incluido', 'adicional')
  );

-- ---------------------------------------------------------------
-- 2) Backfill dos 3 planos oficiais (unicos produtos da categoria
--    'Producao de Curso' com exige_contrato = true)
-- ---------------------------------------------------------------
update crm.produtos_servicos set
  descricao = 'Produção/estruturação de curso online em formato remoto. O cliente grava, nós orientamos, a Criativamente transforma.',
  escopo_objeto = 'Produção/estruturação de curso online em formato remoto, com orientação para que o CONTRATANTE realize a gravação do conteúdo.',
  escopo_quantidade_maxima_aulas = 40,
  escopo_modalidade_gravacao = 'remoto',
  escopo_equipamentos = null,
  escopo_direcao = false,
  escopo_edicao = 'Edição das aulas gravadas pelo CONTRATANTE, incluindo cortes e tratamento do conteúdo.',
  escopo_capas = 'Edição e criação das capas/miniaturas das aulas.',
  escopo_plataforma = 'Estruturação e organização do curso na plataforma.',
  escopo_pagina_vendas = 'Configuração e organização da página de vendas.',
  escopo_certificado = 'nao_incluido',
  escopo_apostila_material = 'nao_incluido',
  escopo_legendas = 'nao_incluido',
  escopo_vinheta = 'nao_incluido',
  escopo_site = 'nao_incluido',
  escopo_midia_fisica = 'nao_incluido',
  escopo_prazo_suporte_meses = 3,
  escopo_observacoes = 'Orientação sobre gravação e organização do conteúdo é fornecida pela CONTRATADA; a gravação em si é de responsabilidade do CONTRATANTE.',
  escopo_exclusoes = 'Produção presencial, apostila/material complementar, legendas, vinheta, site profissional e mídia física não estão incluídos neste plano.'
where nome = 'Start';

update crm.produtos_servicos set
  descricao = 'Tudo do plano Start, acrescido de produção presencial em São Paulo e região, com direção, equipamentos e ensaio prévio.',
  escopo_objeto = 'Produção presencial de curso online em São Paulo e região, com direção de gravação, seguida de edição e estruturação do curso.',
  escopo_quantidade_maxima_aulas = 40,
  escopo_modalidade_gravacao = 'presencial',
  escopo_equipamentos = '2 câmeras, iluminação e microfone de lapela; uso de teleprompter.',
  escopo_direcao = true,
  escopo_edicao = 'Edição das aulas gravadas presencialmente, incluindo cortes e tratamento do conteúdo.',
  escopo_capas = 'Criação e edição das capas/miniaturas das aulas.',
  escopo_plataforma = 'Estruturação do curso na plataforma.',
  escopo_pagina_vendas = 'Organização e configuração da página de vendas.',
  escopo_certificado = 'nao_incluido',
  escopo_apostila_material = 'nao_incluido',
  escopo_legendas = 'nao_incluido',
  escopo_vinheta = 'nao_incluido',
  escopo_site = 'nao_incluido',
  escopo_midia_fisica = 'nao_incluido',
  escopo_prazo_suporte_meses = 3,
  escopo_observacoes = 'Inclui ensaio/orientação prévia à gravação. A produção presencial depende de agendamento prévio; o CONTRATANTE deve cumprir o horário/data agendados, pois a reserva de datas gera planejamento operacional da CONTRATADA.',
  escopo_exclusoes = 'Apostila/material complementar, legendas, vinheta, site profissional e mídia física não estão incluídos neste plano.'
where nome = 'Professional';

update crm.produtos_servicos set
  descricao = 'Tudo do plano Professional, com até 60 aulas (podendo ser distribuídas entre cursos relacionados ao mesmo projeto), apostila, legendas, vinheta, site profissional e mídia física.',
  escopo_objeto = 'Produção presencial de curso online em São Paulo e região, com direção de gravação, edição, materiais complementares e site profissional, conforme planejamento contratado.',
  escopo_quantidade_maxima_aulas = 60,
  escopo_modalidade_gravacao = 'presencial',
  escopo_equipamentos = '2 câmeras, iluminação e microfone de lapela; uso de teleprompter.',
  escopo_direcao = true,
  escopo_edicao = 'Edição das aulas gravadas presencialmente, incluindo cortes e tratamento do conteúdo.',
  escopo_capas = 'Criação e edição das capas/miniaturas das aulas.',
  escopo_plataforma = 'Estruturação do curso na plataforma.',
  escopo_pagina_vendas = 'Organização e configuração da página de vendas.',
  escopo_certificado = 'nao_incluido',
  escopo_apostila_material = 'incluido',
  escopo_legendas = 'incluido',
  escopo_vinheta = 'incluido',
  escopo_site = 'incluido',
  escopo_midia_fisica = 'incluido',
  escopo_prazo_suporte_meses = 6,
  escopo_observacoes = 'O limite de 60 aulas é o total contratado. As aulas podem ser distribuídas entre cursos relacionados ao mesmo expert/projeto conjunto, conforme planejamento contratado, mas essa distribuição não significa que cada curso terá 60 aulas — a quantidade total contratada é preservada. Inclui ensaio/orientação prévia à gravação; produção presencial depende de agendamento prévio.',
  escopo_exclusoes = 'Certificado não está incluído neste plano, salvo condição especial expressamente prevista no contrato.'
where nome = 'Prime';

-- ---------------------------------------------------------------
-- 3) Snapshot do escopo em contrato_itens (mesmas colunas, espelhadas)
-- ---------------------------------------------------------------
alter table crm.contrato_itens
  add column escopo_objeto text,
  add column escopo_quantidade_maxima_aulas integer,
  add column escopo_modalidade_gravacao text,
  add column escopo_equipamentos text,
  add column escopo_direcao boolean,
  add column escopo_edicao text,
  add column escopo_capas text,
  add column escopo_plataforma text,
  add column escopo_pagina_vendas text,
  add column escopo_certificado text,
  add column escopo_apostila_material text,
  add column escopo_legendas text,
  add column escopo_vinheta text,
  add column escopo_site text,
  add column escopo_midia_fisica text,
  add column escopo_prazo_suporte_meses integer,
  add column escopo_observacoes text,
  add column escopo_exclusoes text;

-- Copia o escopo do produto pro item SOMENTE no INSERT (nunca no UPDATE) --
-- e somente quando o item ainda nao tem um escopo proprio preenchido, pra
-- nao sobrescrever um item de outra origem (ex.: item manual sem produto_id).
create or replace function crm.trg_before_contrato_item()
returns trigger
language plpgsql
security definer
set search_path to 'crm', 'public'
as $$
declare
  v_empresa_contrato uuid;
  v_status_contrato text;
  v_produto crm.produtos_servicos%rowtype;
begin
  select empresa_id, status into v_empresa_contrato, v_status_contrato
  from crm.contratos where id = new.contrato_id;

  if v_empresa_contrato is distinct from new.empresa_id then
    raise exception 'Item pertence a um contrato de outra empresa (integridade violada).';
  end if;

  if v_status_contrato = 'validado'
     and not crm.tem_permissao(auth.uid(), v_empresa_contrato, 'contratos', 'administrar') then
    raise exception 'Este contrato já foi validado. Os itens não podem mais ser alterados.';
  end if;

  if tg_op = 'INSERT' and new.produto_id is not null then
    select * into v_produto from crm.produtos_servicos where id = new.produto_id;
    if found then
      new.escopo_objeto := v_produto.escopo_objeto;
      new.escopo_quantidade_maxima_aulas := v_produto.escopo_quantidade_maxima_aulas;
      new.escopo_modalidade_gravacao := v_produto.escopo_modalidade_gravacao;
      new.escopo_equipamentos := v_produto.escopo_equipamentos;
      new.escopo_direcao := v_produto.escopo_direcao;
      new.escopo_edicao := v_produto.escopo_edicao;
      new.escopo_capas := v_produto.escopo_capas;
      new.escopo_plataforma := v_produto.escopo_plataforma;
      new.escopo_pagina_vendas := v_produto.escopo_pagina_vendas;
      new.escopo_certificado := v_produto.escopo_certificado;
      new.escopo_apostila_material := v_produto.escopo_apostila_material;
      new.escopo_legendas := v_produto.escopo_legendas;
      new.escopo_vinheta := v_produto.escopo_vinheta;
      new.escopo_site := v_produto.escopo_site;
      new.escopo_midia_fisica := v_produto.escopo_midia_fisica;
      new.escopo_prazo_suporte_meses := v_produto.escopo_prazo_suporte_meses;
      new.escopo_observacoes := v_produto.escopo_observacoes;
      new.escopo_exclusoes := v_produto.escopo_exclusoes;
    end if;
  end if;

  new.valor_total := greatest(
    new.quantidade * new.valor_negociado_unitario - coalesce(new.desconto_unitario, 0),
    0
  );
  return new;
end;
$$;

-- ---------------------------------------------------------------
-- 4) Endereco completo passa a ser obrigatorio na confirmacao publica
--    (nao no INSERT/rascunho -- o cliente pode ir preenchendo aos poucos
--    e so precisa estar completo na hora de confirmar de vez).
-- ---------------------------------------------------------------
create or replace function crm.confirmar_dados_contrato(p_token_hash text)
returns table (contrato_id uuid, novo_status_contrato text)
language plpgsql
security definer
set search_path to 'crm', 'public'
as $$
declare
  v_link crm.contrato_links%rowtype;
  v_dados_existentes crm.contrato_dados_cliente%rowtype;
  v_novo_status text;
begin
  select * into v_link from crm.contrato_links where token_hash = p_token_hash for update;

  if not found or v_link.status <> 'ativo' or v_link.expires_at <= now() then
    raise exception 'link_indisponivel';
  end if;

  select * into v_dados_existentes from crm.contrato_dados_cliente where link_id = v_link.id;
  if not found then
    raise exception 'dados_nao_preenchidos';
  end if;

  if v_dados_existentes.nome_completo is null or btrim(v_dados_existentes.nome_completo) = ''
     or v_dados_existentes.cpf_cnpj is null or btrim(v_dados_existentes.cpf_cnpj) = ''
     or v_dados_existentes.telefone is null or btrim(v_dados_existentes.telefone) = ''
     or v_dados_existentes.email is null or btrim(v_dados_existentes.email) = ''
     or v_dados_existentes.endereco_cep is null or btrim(v_dados_existentes.endereco_cep) = ''
     or v_dados_existentes.endereco_logradouro is null or btrim(v_dados_existentes.endereco_logradouro) = ''
     or v_dados_existentes.endereco_numero is null or btrim(v_dados_existentes.endereco_numero) = ''
     or v_dados_existentes.endereco_bairro is null or btrim(v_dados_existentes.endereco_bairro) = ''
     or v_dados_existentes.endereco_cidade is null or btrim(v_dados_existentes.endereco_cidade) = ''
     or v_dados_existentes.endereco_estado is null or btrim(v_dados_existentes.endereco_estado) = '' then
    raise exception 'dados_incompletos';
  end if;

  update crm.contrato_dados_cliente
    set confirmado_em = now()
    where link_id = v_link.id;

  update crm.contrato_links
    set status = 'confirmado', confirmado_em = now(), last_access_at = now()
    where id = v_link.id;

  update crm.contratos
    set status = case when status in ('rascunho', 'enviado') then 'aguardando_assinatura' else status end
    where id = v_link.contrato_id
    returning status into v_novo_status;

  insert into crm.atividades (empresa_id, contrato_id, tipo, titulo, metadata)
    values (
      v_link.empresa_id, v_link.contrato_id, 'dados_confirmados',
      'Cliente revisou e confirmou os dados e as condições do contrato',
      jsonb_build_object('link_id', v_link.id)
    );

  return query select v_link.contrato_id, v_novo_status;
end;
$$;
