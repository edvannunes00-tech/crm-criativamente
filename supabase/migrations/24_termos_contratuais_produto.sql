-- Contratos — Migration 24
-- Campo de termos contratuais livres por produto, pensado pra produtos
-- futuros cujo escopo nao caiba nos campos estruturados da migration 23.
-- Some junto no snapshot do item, igual todo o resto do escopo.

alter table crm.produtos_servicos add column termos_contratuais text;
alter table crm.contrato_itens add column termos_contratuais text;

update crm.produtos_servicos set termos_contratuais =
  'O plano contempla até 40 aulas. Aulas adicionais, regravações ou produções além do limite contratado são tratadas como serviço adicional e podem gerar novo orçamento. Suporte de 3 meses para orientação e auxílio operacional dentro do escopo contratado — não inclui novas gravações, regravações ou produção adicional.'
where nome = 'Start';

update crm.produtos_servicos set termos_contratuais =
  'O plano contempla até 40 aulas em produção presencial em São Paulo e região, mediante agendamento prévio. A reserva de data gera planejamento operacional da CONTRATADA (equipe, equipamentos e programação de edição) — cancelamentos ou adiamentos por iniciativa do CONTRATANTE sem alinhamento prévio estão sujeitos à cláusula de sinal/reserva. Aulas adicionais, regravações ou produções além do limite contratado são tratadas como serviço adicional. Suporte de 3 meses para orientação e auxílio operacional dentro do escopo contratado.'
where nome = 'Professional';

update crm.produtos_servicos set termos_contratuais =
  'O plano contempla até 60 aulas em produção presencial em São Paulo e região, mediante agendamento prévio, podendo ser distribuídas entre cursos relacionados ao mesmo expert/projeto conforme planejamento contratado, sem alterar a quantidade total contratada. A reserva de data gera planejamento operacional da CONTRATADA — cancelamentos ou adiamentos por iniciativa do CONTRATANTE sem alinhamento prévio estão sujeitos à cláusula de sinal/reserva. Aulas adicionais, regravações ou produções além do limite contratado são tratadas como serviço adicional. Suporte de 6 meses para orientação e auxílio operacional dentro do escopo contratado.'
where nome = 'Prime';

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
      new.termos_contratuais := v_produto.termos_contratuais;
    end if;
  end if;

  new.valor_total := greatest(
    new.quantidade * new.valor_negociado_unitario - coalesce(new.desconto_unitario, 0),
    0
  );
  return new;
end;
$$;
