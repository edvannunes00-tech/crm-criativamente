-- Contratos — Migration 22
-- Bug real: contrato-gerar-link permite gerar link de preenchimento com o
-- contrato ainda em 'rascunho' (so bloqueia assinado/validado/cancelado),
-- mas confirmar_dados_contrato so avancava o status quando ele estava
-- 'enviado' -- deixando o contrato preso em 'rascunho' mesmo depois do
-- cliente confirmar os dados (e ate assinar), o que travava toda a aba
-- Assinatura (podeRegistrar exige status aguardando_assinatura/assinado).

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
