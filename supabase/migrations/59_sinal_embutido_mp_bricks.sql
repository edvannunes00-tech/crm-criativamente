-- Pedido do Edvan (2026-11-09): o sinal do contrato deixa de redirecionar pro
-- Checkout Pro do Mercado Pago (preference + init_point) e passa a ser cobrado
-- embutido na propria pagina publica do contrato, via Payment Brick (cartao OU
-- Pix, sem sair do site) -- mesmo padrao ja validado em producao no
-- Agenda.Criativamente (app.aplicar_pagamento_mp / app.registrar_pagamento_mp_pendente).
--
-- Nenhuma funcao existente teve sua assinatura alterada (licao aprendida: isso
-- ja quebrou producao duas vezes no Agenda.Criativamente por causar overload
-- ambiguo no PostgREST). crm.registrar_pagamento_avulso(6 args, chave por
-- provider_preference_id) continua intacta -- so deixa de ser chamada por novos
-- pagamentos (que nao tem mais preference), mas qualquer historico antigo que a
-- referencie continua valido.

-- 1) Colunas novas pro QR code do Pix (Payment Brick nao redireciona pra pagina
--    do Mercado Pago -- o QR/copia-e-cola precisa ser mostrado na nossa propria
--    tela). Mesmos nomes de app.agendamento_pagamentos_mp, pra manter o padrao.
alter table crm.contrato_pagamentos_avulsos add column if not exists qr_code text;
alter table crm.contrato_pagamentos_avulsos add column if not exists qr_code_base64 text;

comment on column crm.contrato_pagamentos_avulsos.qr_code is 'Pix copia-e-cola (so quando metodo=pix e status=pendente) -- devolvido pela Payments API na criacao do pagamento.';
comment on column crm.contrato_pagamentos_avulsos.qr_code_base64 is 'QR code do Pix em base64 (PNG) -- mesma origem do qr_code.';

-- 2) Cria o pagamento 'pendente' ja validado no servidor -- nunca confia num
--    valor vindo do navegador: sempre le contratos.sinal_valor (o EXATO valor
--    cadastrado pelo operador, igual a regra que ja existia na Edge Function).
--    Chamada publica/anonima (link assinado), por isso nao tem p_criado_por.
create or replace function crm.registrar_pagamento_avulso_pendente(p_contrato_id uuid, p_metodo text)
returns crm.contrato_pagamentos_avulsos
language plpgsql security definer set search_path = 'crm', 'public' as $$
declare
  v_empresa uuid;
  v_sinal numeric;
  v_ja_aprovado boolean;
  v_result crm.contrato_pagamentos_avulsos;
begin
  select empresa_id, sinal_valor into v_empresa, v_sinal from crm.contratos where id = p_contrato_id;
  if v_empresa is null then raise exception 'Contrato nao encontrado.'; end if;
  if v_sinal is null or v_sinal <= 0 then raise exception 'Este contrato nao tem sinal configurado.'; end if;
  if p_metodo not in ('cartao', 'pix') then raise exception 'Metodo invalido.'; end if;

  select exists(
    select 1 from crm.contrato_pagamentos_avulsos
    where contrato_id = p_contrato_id and tipo = 'sinal' and status = 'aprovado'
  ) into v_ja_aprovado;
  if v_ja_aprovado then raise exception 'O sinal deste contrato ja foi pago.'; end if;

  insert into crm.contrato_pagamentos_avulsos (empresa_id, contrato_id, tipo, metodo, valor, status)
  values (v_empresa, p_contrato_id, 'sinal', p_metodo, v_sinal, 'pendente')
  returning * into v_result;
  return v_result;
end; $$;
revoke execute on function crm.registrar_pagamento_avulso_pendente(uuid, text) from public;
grant execute on function crm.registrar_pagamento_avulso_pendente(uuid, text) to service_role;

-- 3) Aplica o resultado do pagamento (criado direto via Payments API, chave por
--    id proprio -- nao por provider_preference_id, que deixa de existir nesse
--    fluxo). Reaproveita o mesmo efeito colateral que crm.registrar_pagamento_avulso
--    ja tinha na aprovacao (atividade + recebimento), so muda a forma de localizar
--    a linha. SECURITY DEFINER, so service_role chama (webhook e a propria Edge
--    Function de cobranca, nunca o navegador do cliente).
create or replace function crm.aplicar_pagamento_avulso_mp(
  p_pagamento_id uuid, p_status text, p_status_provedor text, p_provider_payment_id text,
  p_qr_code text default null, p_qr_code_base64 text default null, p_pago_em timestamptz default null
)
returns crm.contrato_pagamentos_avulsos
language plpgsql security definer set search_path = 'crm', 'public' as $$
declare
  v_antes crm.contrato_pagamentos_avulsos;
  v_row crm.contrato_pagamentos_avulsos;
  v_oportunidade_id uuid;
  v_forma_pagamento_id uuid;
begin
  select * into v_antes from crm.contrato_pagamentos_avulsos where id = p_pagamento_id for update;
  if v_antes.id is null then raise exception 'Pagamento nao encontrado.'; end if;
  if p_status not in ('pendente', 'aprovado', 'recusado', 'cancelado', 'estornado') then
    raise exception 'Status invalido.';
  end if;

  update crm.contrato_pagamentos_avulsos set
    status = p_status, status_provedor = p_status_provedor,
    provider_payment_id = coalesce(p_provider_payment_id, provider_payment_id),
    qr_code = coalesce(p_qr_code, qr_code), qr_code_base64 = coalesce(p_qr_code_base64, qr_code_base64),
    pago_em = case when p_status = 'aprovado' then coalesce(p_pago_em, now()) else pago_em end,
    updated_at = now()
  where id = p_pagamento_id
  returning * into v_row;

  -- mesmo efeito colateral que crm.registrar_pagamento_avulso ja fazia na
  -- aprovacao -- so dispara na transicao pra 'aprovado' (idempotente).
  if p_status = 'aprovado' and v_antes.status <> 'aprovado' then
    insert into crm.atividades (empresa_id, contrato_id, tipo, titulo, metadata)
    values (v_row.empresa_id, v_row.contrato_id, 'sinal_pago', 'Sinal pago pelo cliente (' || v_row.metodo || ')',
      jsonb_build_object('valor', v_row.valor, 'pagamento_id', v_row.id));

    select oportunidade_id into v_oportunidade_id from crm.contratos where id = v_row.contrato_id;
    if v_oportunidade_id is not null then
      select id into v_forma_pagamento_id from crm.formas_pagamento
        where empresa_id = v_row.empresa_id and nome = (case when v_row.metodo = 'pix' then 'PIX' else 'Cartão' end)
        limit 1;
      if v_forma_pagamento_id is not null then
        insert into crm.recebimentos (empresa_id, oportunidade_id, forma_pagamento_id, numero_parcela, total_parcelas, valor_bruto, data_prevista, data_efetiva, status, observacao)
        values (v_row.empresa_id, v_oportunidade_id, v_forma_pagamento_id, 1, 1, v_row.valor,
          coalesce(p_pago_em, now())::date, coalesce(p_pago_em, now())::date, 'recebido',
          'Sinal pago via Mercado Pago (' || v_row.metodo || ').');
      end if;
    end if;
  end if;

  return v_row;
end; $$;
revoke execute on function crm.aplicar_pagamento_avulso_mp(uuid, text, text, text, text, text, timestamptz) from public;
grant execute on function crm.aplicar_pagamento_avulso_mp(uuid, text, text, text, text, text, timestamptz) to service_role;
