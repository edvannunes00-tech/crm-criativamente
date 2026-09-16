-- Contratos — Migration 10
-- Funções de banco que a futura Edge Function pública vai chamar (a Edge
-- Function em si NÃO é criada nesta etapa — só a camada SQL que ela vai
-- invocar). Ficam aqui porque a exigência de "confirmação atômica" é uma
-- garantia de banco, não de código de aplicação: mesmo que a Edge Function
-- tenha um bug ou caia no meio do processo, o Postgres garante que
-- contrato_dados_cliente + contrato_links + contratos.status + atividades
-- mudam juntos, numa única transação, ou nada muda.
--
-- Todas recebem o HASH do token (calculado pelo chamador), nunca o token cru.
-- Todas são SECURITY DEFINER: rodam com o dono das tabelas (bypassa RLS,
-- igual às demais funções de sistema já existentes, ex. tem_permissao),
-- e por isso fazem sua própria validação de estado — nunca dependem de
-- auth.uid() (o visitante público não tem sessão Supabase Auth nenhuma).

-- ------------------------------------------------------------------
-- 1) Registrar acesso (chamada a cada GET da página pública)
-- ------------------------------------------------------------------
create function crm.registrar_acesso_link_contrato(p_token_hash text)
returns table (
  contrato_id uuid,
  link_id uuid,
  status_link text
)
language plpgsql
security definer
set search_path to 'crm', 'public'
as $$
declare
  v_link crm.contrato_links%rowtype;
begin
  select * into v_link from crm.contrato_links
  where token_hash = p_token_hash
  for update;

  if not found then
    return; -- nenhuma linha: chamador trata como "link inválido", mensagem genérica
  end if;

  if v_link.status = 'ativo' and v_link.expires_at <= now() then
    update crm.contrato_links set status = 'expirado' where id = v_link.id;
    v_link.status := 'expirado';
    insert into crm.atividades (empresa_id, contrato_id, tipo, titulo)
      values (v_link.empresa_id, v_link.contrato_id, 'link_expirado', 'Link de preenchimento expirou');
  elsif v_link.status = 'ativo' then
    update crm.contrato_links
      set last_access_at = now(), access_count = access_count + 1
      where id = v_link.id;
  end if;

  return query select v_link.contrato_id, v_link.id, v_link.status;
end;
$$;

-- ------------------------------------------------------------------
-- 2) Salvar rascunho (chamada a cada vez que o cliente edita e salva,
--    antes da confirmação final — NÃO trava o formulário)
-- ------------------------------------------------------------------
create function crm.salvar_rascunho_dados_contrato(
  p_token_hash text,
  p_nome_completo text,
  p_cpf_cnpj text,
  p_telefone text,
  p_email text,
  p_endereco_cep text,
  p_endereco_logradouro text,
  p_endereco_numero text,
  p_endereco_complemento text,
  p_endereco_bairro text,
  p_endereco_cidade text,
  p_endereco_estado text
)
returns void
language plpgsql
security definer
set search_path to 'crm', 'public'
as $$
declare
  v_link crm.contrato_links%rowtype;
begin
  select * into v_link from crm.contrato_links where token_hash = p_token_hash for update;

  if not found or v_link.status <> 'ativo' or v_link.expires_at <= now() then
    raise exception 'link_indisponivel';
  end if;

  insert into crm.contrato_dados_cliente (
    empresa_id, contrato_id, link_id, nome_completo, cpf_cnpj, telefone, email,
    endereco_cep, endereco_logradouro, endereco_numero, endereco_complemento,
    endereco_bairro, endereco_cidade, endereco_estado
  ) values (
    v_link.empresa_id, v_link.contrato_id, v_link.id, p_nome_completo, p_cpf_cnpj, p_telefone, p_email,
    p_endereco_cep, p_endereco_logradouro, p_endereco_numero, p_endereco_complemento,
    p_endereco_bairro, p_endereco_cidade, p_endereco_estado
  )
  on conflict (link_id) do update set
    nome_completo = excluded.nome_completo,
    cpf_cnpj = excluded.cpf_cnpj,
    telefone = excluded.telefone,
    email = excluded.email,
    endereco_cep = excluded.endereco_cep,
    endereco_logradouro = excluded.endereco_logradouro,
    endereco_numero = excluded.endereco_numero,
    endereco_complemento = excluded.endereco_complemento,
    endereco_bairro = excluded.endereco_bairro,
    endereco_cidade = excluded.endereco_cidade,
    endereco_estado = excluded.endereco_estado;
  -- atualizado_em é ajustado pelo próprio trigger da tabela (migration 06).
end;
$$;

-- ------------------------------------------------------------------
-- 3) Confirmar (operação atômica final — dados + link + status do
--    contrato + histórico mudam juntos ou nada muda)
-- ------------------------------------------------------------------
create function crm.confirmar_dados_contrato(p_token_hash text)
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
    set status = case when status = 'enviado' then 'aguardando_assinatura' else status end
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

-- ------------------------------------------------------------------
-- Trigger em crm.contratos: ao sair de rascunho/enviado/aguardando_assinatura
-- para assinado/validado/cancelado, qualquer link ainda "ativo" desse
-- contrato é automaticamente expirado (regra da seção 7 da spec: contrato
-- finalizado nunca deixa link de preenchimento reabrir o formulário).
-- ------------------------------------------------------------------
create function crm.trg_expirar_links_contrato_finalizado()
returns trigger
language plpgsql
security definer
set search_path to 'crm', 'public'
as $$
begin
  if new.status in ('assinado', 'validado', 'cancelado') and old.status is distinct from new.status then
    update crm.contrato_links
      set status = 'expirado'
      where contrato_id = new.id and status = 'ativo';
  end if;
  return new;
end;
$$;

create trigger trg_expirar_links_contrato_finalizado
  after update on crm.contratos
  for each row execute function crm.trg_expirar_links_contrato_finalizado();
