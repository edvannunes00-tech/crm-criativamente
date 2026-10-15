create trigger trg_propostas_updated_at
  before update on crm.propostas
  for each row execute function crm.set_updated_at();

create trigger trg_rastro_autor_propostas
  before insert or update on crm.propostas
  for each row execute function crm.trg_rastro_autor();

create or replace function crm.trg_before_proposta_item()
returns trigger
language plpgsql
security definer
set search_path to 'crm', 'public'
as $function$
declare
  v_produto crm.produtos_servicos%rowtype;
begin
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
      new.recorrencia_tipo := v_produto.recorrencia_tipo;
      new.recorrencia_valor_mensal := v_produto.recorrencia_valor_mensal;
      new.recorrencia_valor_anual := v_produto.recorrencia_valor_anual;
    end if;
  end if;

  new.valor_total := greatest(
    coalesce(new.quantidade, 1) * coalesce(new.valor_negociado_unitario, 0) - coalesce(new.desconto_unitario, 0),
    0
  );
  return new;
end;
$function$;

create trigger trg_before_proposta_item
  before insert on crm.proposta_itens
  for each row execute function crm.trg_before_proposta_item();

create or replace function crm.trg_proposta_evento()
returns trigger
language plpgsql
security definer
set search_path to 'crm', 'public'
as $function$
declare
  v_tipo text;
  v_titulo text;
begin
  if TG_OP = 'INSERT' then
    insert into crm.atividades (empresa_id, contato_id, oportunidade_id, proposta_id, tipo, titulo, descricao, usuario_id)
    values (new.empresa_id, new.contato_id, new.oportunidade_id, new.id, 'proposta_criada', 'Proposta criada', new.titulo, auth.uid());
    return new;
  end if;

  if TG_OP = 'UPDATE' and new.status is distinct from old.status then
    v_tipo := case new.status
      when 'enviada' then 'proposta_enviada'
      when 'visualizada' then 'proposta_visualizada'
      when 'aceita' then 'proposta_aceita'
      when 'recusada' then 'proposta_recusada'
      when 'expirada' then 'proposta_expirada'
      when 'cancelada' then 'proposta_cancelada'
      when 'substituida' then 'proposta_substituida'
      else null
    end;
    v_titulo := case new.status
      when 'enviada' then 'Proposta enviada'
      when 'visualizada' then 'Proposta visualizada pelo cliente'
      when 'aceita' then 'Proposta aceita'
      when 'recusada' then 'Proposta recusada'
      when 'expirada' then 'Proposta expirada'
      when 'cancelada' then 'Proposta cancelada'
      when 'substituida' then 'Proposta substituída por nova versão'
      else null
    end;
    if v_tipo is not null then
      insert into crm.atividades (empresa_id, contato_id, oportunidade_id, proposta_id, tipo, titulo, descricao, usuario_id)
      values (new.empresa_id, new.contato_id, new.oportunidade_id, new.id, v_tipo, v_titulo, new.titulo, auth.uid());
    end if;
  end if;

  if TG_OP = 'UPDATE' and new.contrato_id is not null and old.contrato_id is null then
    insert into crm.atividades (empresa_id, contato_id, oportunidade_id, proposta_id, contrato_id, tipo, titulo, descricao, usuario_id)
    values (new.empresa_id, new.contato_id, new.oportunidade_id, new.id, new.contrato_id, 'proposta_convertida_em_contrato', 'Proposta convertida em contrato', new.titulo, auth.uid());
  end if;

  return new;
end;
$function$;

create trigger trg_proposta_evento
  after insert or update on crm.propostas
  for each row execute function crm.trg_proposta_evento();
