create or replace function crm.registrar_acesso_link_proposta(p_token_hash text)
returns table (proposta_id uuid, link_id uuid, status_link text, status_proposta text)
language plpgsql
security definer
set search_path to 'crm', 'public'
as $function$
declare
  v_link crm.proposta_links%rowtype;
  v_status_proposta text;
begin
  select * into v_link from crm.proposta_links where token_hash = p_token_hash for update;
  if not found then return; end if;

  if v_link.status = 'ativo' and v_link.expires_at <= now() then
    update crm.proposta_links set status = 'expirado' where id = v_link.id;
    v_link.status := 'expirado';
    update crm.propostas set status = 'expirada', expirada_em = now()
      where id = v_link.proposta_id and status in ('rascunho','enviada','visualizada');
  elsif v_link.status = 'ativo' then
    update crm.proposta_links set last_access_at = now(), access_count = access_count + 1 where id = v_link.id;
    update crm.propostas set status = 'visualizada', primeira_visualizacao_em = coalesce(primeira_visualizacao_em, now())
      where id = v_link.proposta_id and status = 'enviada';
  end if;

  select status into v_status_proposta from crm.propostas where id = v_link.proposta_id;
  return query select v_link.proposta_id, v_link.id, v_link.status, v_status_proposta;
end
$function$;

create or replace function crm.responder_proposta(p_token_hash text, p_resposta text)
returns table (ok boolean, motivo text)
language plpgsql
security definer
set search_path to 'crm', 'public'
as $function$
declare
  v_link crm.proposta_links%rowtype;
  v_proposta crm.propostas%rowtype;
begin
  if p_resposta not in ('aceita', 'recusada') then
    return query select false, 'resposta_invalida'; return;
  end if;

  select * into v_link from crm.proposta_links where token_hash = p_token_hash for update;
  if not found or v_link.status <> 'ativo' then
    return query select false, 'link_indisponivel'; return;
  end if;
  if v_link.expires_at <= now() then
    update crm.proposta_links set status = 'expirado' where id = v_link.id;
    update crm.propostas set status = 'expirada', expirada_em = now() where id = v_link.proposta_id and status in ('rascunho','enviada','visualizada');
    return query select false, 'proposta_expirada'; return;
  end if;

  select * into v_proposta from crm.propostas where id = v_link.proposta_id for update;
  if v_proposta.status not in ('enviada', 'visualizada') then
    return query select false, 'status_invalido'; return;
  end if;

  if p_resposta = 'aceita' then
    update crm.propostas set status = 'aceita', aceita_em = now() where id = v_proposta.id;
  else
    update crm.propostas set status = 'recusada', recusada_em = now() where id = v_proposta.id;
  end if;
  update crm.proposta_links set respondida_em = now() where id = v_link.id;

  return query select true, null::text;
end
$function$;

grant execute on function crm.registrar_acesso_link_proposta(text) to service_role;
grant execute on function crm.responder_proposta(text, text) to service_role;
