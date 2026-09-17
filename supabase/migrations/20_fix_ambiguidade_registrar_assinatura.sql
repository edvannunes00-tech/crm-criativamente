-- Contratos — Migration 20
-- Bug real encontrado no teste HTTP: "contrato_id" ambiguo dentro de
-- registrar_assinatura_contrato porque o RETURNING usava o mesmo nome
-- da coluna de retorno da funcao (RETURNS TABLE(contrato_id uuid)).
-- Qualifica a coluna da tabela explicitamente.

create or replace function crm.registrar_assinatura_contrato(p_token_hash text, p_storage_path text)
returns table (contrato_id uuid)
language plpgsql
security definer
set search_path to 'crm', 'public'
as $$
declare
  v_link crm.contrato_links%rowtype;
  v_atualizado uuid;
begin
  select * into v_link from crm.contrato_links where token_hash = p_token_hash for update;

  if not found or v_link.status <> 'confirmado' then
    raise exception 'link_indisponivel';
  end if;

  update crm.contrato_dados_cliente
    set assinatura_storage_path = p_storage_path, assinatura_confirmada_em = now()
    where link_id = v_link.id and assinatura_storage_path is null
    returning crm.contrato_dados_cliente.contrato_id into v_atualizado;

  if v_atualizado is null then
    raise exception 'assinatura_ja_registrada';
  end if;

  insert into crm.atividades (empresa_id, contrato_id, tipo, titulo, metadata)
    values (v_link.empresa_id, v_link.contrato_id, 'assinatura_registrada', 'Cliente assinou o contrato (assinatura desenhada)', jsonb_build_object('link_id', v_link.id));

  return query select v_atualizado;
end;
$$;
