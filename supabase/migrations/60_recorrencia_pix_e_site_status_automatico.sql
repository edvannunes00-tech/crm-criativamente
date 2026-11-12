-- Pedido do Edvan (2026-11-12): recorrência do contrato (manutenção/suporte)
-- passa a aceitar Pix, além de cartão. Mercado Pago não tem Pix recorrente
-- (Preapproval só aceita cartão), então o Pix aqui é uma cobrança avulsa por
-- competência (mês) -- o cliente revisita a mesma pagina publica do contrato
-- todo mês pra gerar e pagar o Pix daquele mês.
--
-- Também: site_status (hoje só um rótulo manual no painel) passa a se ajustar
-- sozinho conforme o status financeiro real, mas com um override manual que
-- o Edvan pode acionar e que trava a automação até ele mesmo liberar --
-- pedido explícito: "tem de ter a opcao de voltar manualmente o site ai eu
-- corrijo enquanto entendo e ajusto o pagamento".
--
-- Nenhuma função existente muda de assinatura (mesma lição do arquivo 59).

-- 1) Cobrança Pix da recorrência reaproveita contrato_pagamentos_avulsos
--    (mesma tabela do sinal), só com colunas novas pra amarrar na assinatura
--    e na competência (mês) cobrada -- evita cobrar o mesmo mês duas vezes.
alter table crm.contrato_pagamentos_avulsos add column if not exists assinatura_recorrente_id uuid references crm.assinaturas_recorrentes(id);
alter table crm.contrato_pagamentos_avulsos add column if not exists competencia text;
create unique index if not exists contrato_pagamentos_avulsos_competencia_unica
  on crm.contrato_pagamentos_avulsos (assinatura_recorrente_id, competencia)
  where assinatura_recorrente_id is not null and status in ('pendente', 'aprovado');

comment on column crm.contrato_pagamentos_avulsos.assinatura_recorrente_id is 'Preenchido so quando tipo=recorrencia_pix: a assinatura que esta cobranca do mes se refere.';
comment on column crm.contrato_pagamentos_avulsos.competencia is 'Mes cobrado, formato YYYY-MM. So preenchido junto com assinatura_recorrente_id.';

-- 2) site_status deixa de ser so um rotulo digitado no painel -- agora tem
--    um booleano que diz se o Edvan travou ele manualmente (e nesse caso a
--    automacao nunca mexe, ate ele mesmo destravar).
alter table crm.assinaturas_recorrentes add column if not exists site_status_manual boolean default false not null;
comment on column crm.assinaturas_recorrentes.site_status_manual is 'true = Edvan fixou site_status manualmente no painel; a automacao de pagamento para de tocar nesse campo ate ele desmarcar.';

-- 3) Cria a cobranca Pix do mes (idempotente: se ja existe pendente pro mes
--    atual, devolve a mesma -- pra re-mostrar o QR sem duplicar).
create or replace function crm.registrar_cobranca_recorrencia_pix_pendente(p_assinatura_id uuid)
returns crm.contrato_pagamentos_avulsos
language plpgsql security definer set search_path = 'crm', 'public' as $$
declare
  v_a crm.assinaturas_recorrentes%rowtype;
  v_competencia text;
  v_existente crm.contrato_pagamentos_avulsos;
  v_result crm.contrato_pagamentos_avulsos;
begin
  select * into v_a from crm.assinaturas_recorrentes where id = p_assinatura_id for update;
  if v_a.id is null then raise exception 'Assinatura nao encontrada.'; end if;
  if v_a.status_financeiro in ('cancelado', 'encerrado') then raise exception 'Assinatura cancelada.'; end if;

  v_competencia := to_char(now(), 'YYYY-MM');

  select * into v_existente from crm.contrato_pagamentos_avulsos
    where assinatura_recorrente_id = p_assinatura_id and competencia = v_competencia
    order by created_at desc limit 1;

  if v_existente.id is not null then
    if v_existente.status = 'aprovado' then raise exception 'Este mes ja foi pago.'; end if;
    return v_existente; -- pendente: devolve a mesma pra re-mostrar o QR
  end if;

  insert into crm.contrato_pagamentos_avulsos (empresa_id, contrato_id, tipo, metodo, valor, status, assinatura_recorrente_id, competencia)
  values (v_a.empresa_id, v_a.contrato_id, 'recorrencia_pix', 'pix', v_a.valor, 'pendente', p_assinatura_id, v_competencia)
  returning * into v_result;
  return v_result;
end; $$;
revoke execute on function crm.registrar_cobranca_recorrencia_pix_pendente(uuid) from public;
grant execute on function crm.registrar_cobranca_recorrencia_pix_pendente(uuid) to service_role;

-- 4) Calcula o site_status automatico a partir do status financeiro real --
--    so usado quando site_status_manual = false.
create or replace function crm.site_status_automatico(p_status_financeiro text, p_carencia_ate timestamptz)
returns text language sql immutable as $$
  select case
    when p_status_financeiro in ('cancelado', 'encerrado') then 'suspenso'
    when p_status_financeiro = 'inadimplente' and p_carencia_ate is not null and p_carencia_ate < now() then 'suspenso'
    when p_status_financeiro in ('ativo', 'inadimplente', 'pendente', 'aguardando_pagamento') then 'no_ar'
    else 'nao_aplicavel'
  end;
$$;

-- 5) Aplica o resultado de uma cobranca Pix da recorrencia (chamada pelo
--    webhook e pela propria Edge Function) -- mesmo papel que
--    crm.aplicar_preapproval tem pro cartao, so que pra Pix avulso por mes.
create or replace function crm.aplicar_cobranca_recorrencia_pix(
  p_pagamento_id uuid, p_status text, p_status_provedor text, p_provider_payment_id text,
  p_qr_code text default null, p_qr_code_base64 text default null, p_pago_em timestamptz default null
)
returns crm.contrato_pagamentos_avulsos
language plpgsql security definer set search_path = 'crm', 'public' as $$
declare
  v_antes crm.contrato_pagamentos_avulsos;
  v_pg crm.contrato_pagamentos_avulsos;
  v_a crm.assinaturas_recorrentes%rowtype;
  v_novo_financeiro text;
  v_car integer;
  v_forma_pagamento_id uuid;
begin
  select * into v_antes from crm.contrato_pagamentos_avulsos where id = p_pagamento_id for update;
  if v_antes.id is null then raise exception 'Pagamento nao encontrado.'; end if;
  if v_antes.assinatura_recorrente_id is null then raise exception 'Este pagamento nao e de uma recorrencia.'; end if;
  if p_status not in ('pendente', 'aprovado', 'recusado', 'cancelado', 'estornado') then raise exception 'Status invalido.'; end if;

  update crm.contrato_pagamentos_avulsos set
    status = p_status, status_provedor = p_status_provedor,
    provider_payment_id = coalesce(p_provider_payment_id, provider_payment_id),
    qr_code = coalesce(p_qr_code, qr_code), qr_code_base64 = coalesce(p_qr_code_base64, qr_code_base64),
    pago_em = case when p_status = 'aprovado' then coalesce(p_pago_em, now()) else pago_em end,
    updated_at = now()
  where id = p_pagamento_id
  returning * into v_pg;

  if p_status = v_antes.status then return v_pg; end if; -- sem mudanca, nao reaplica efeito colateral

  select * into v_a from crm.assinaturas_recorrentes where id = v_pg.assinatura_recorrente_id for update;
  v_car := crm.carencia_dias_recorrencia(v_a.empresa_id);

  v_novo_financeiro := case
    when p_status = 'aprovado' then 'ativo'
    when p_status in ('recusado', 'cancelado', 'estornado') then 'inadimplente'
    else v_a.status_financeiro
  end;

  update crm.assinaturas_recorrentes set
    status_financeiro = v_novo_financeiro,
    status_provedor = coalesce('pix_' || p_status, status_provedor),
    inicio_em = case when v_novo_financeiro = 'ativo' then coalesce(inicio_em, now()) else inicio_em end,
    ultima_cobranca_em = now(),
    ultima_cobranca_status = p_status,
    ultima_aprovada_em = case when p_status = 'aprovado' then now() else ultima_aprovada_em end,
    ultima_recusada_em = case when p_status in ('recusado', 'cancelado', 'estornado') then now() else ultima_recusada_em end,
    proxima_cobranca_em = case when p_status = 'aprovado' then (date_trunc('month', now()) + interval '1 month') else proxima_cobranca_em end,
    carencia_ate = case
      when v_novo_financeiro = 'ativo' then null
      when v_novo_financeiro = 'inadimplente' then coalesce(carencia_ate, now() + make_interval(days => v_car))
      else carencia_ate
    end,
    site_status = case when not site_status_manual then crm.site_status_automatico(v_novo_financeiro,
      case when v_novo_financeiro = 'inadimplente' then coalesce(carencia_ate, now() + make_interval(days => v_car)) else carencia_ate end)
      else site_status end,
    updated_at = now()
  where id = v_a.id;

  insert into crm.atividades (empresa_id, contrato_id, contato_id, tipo, titulo, metadata)
  values (v_a.empresa_id, v_a.contrato_id, v_a.contato_id, 'recorrencia_pix_' || p_status,
    case p_status when 'aprovado' then 'Mensalidade paga via Pix (' || v_pg.competencia || ')'
                  else 'Pix da mensalidade (' || v_pg.competencia || ') ficou: ' || p_status end,
    jsonb_build_object('valor', v_pg.valor, 'pagamento_id', v_pg.id, 'competencia', v_pg.competencia));

  if p_status = 'aprovado' then
    select id into v_forma_pagamento_id from crm.formas_pagamento where empresa_id = v_a.empresa_id and nome = 'PIX' limit 1;
    if v_forma_pagamento_id is not null then
      insert into crm.recebimentos (empresa_id, forma_pagamento_id, numero_parcela, total_parcelas, valor_bruto, data_prevista, data_efetiva, status, observacao)
      values (v_a.empresa_id, v_forma_pagamento_id, 1, 1, v_pg.valor, coalesce(p_pago_em, now())::date, coalesce(p_pago_em, now())::date,
        'recebido', 'Mensalidade (' || v_pg.competencia || ') paga via Pix -- contrato ' || v_a.contrato_id);
    end if;
  end if;

  return v_pg;
end; $$;
revoke execute on function crm.aplicar_cobranca_recorrencia_pix(uuid, text, text, text, text, text, timestamptz) from public;
grant execute on function crm.aplicar_cobranca_recorrencia_pix(uuid, text, text, text, text, text, timestamptz) to service_role;

-- 6) Faz o aplicar_preapproval (cartao) tambem respeitar o override manual e
--    manter o site_status sincronizado -- precisa ser recriado (mesma
--    assinatura, so muda o corpo: nao conta como "funcao nova com
--    assinatura diferente").
create or replace function crm.aplicar_preapproval(p_assinatura_id uuid, p_provider_subscription_id text, p_status_provedor text, p_inicio timestamp with time zone, p_proxima timestamp with time zone, p_motivo text)
 returns text
 language plpgsql
 security definer
 set search_path to 'crm', 'public'
as $function$
declare a crm.assinaturas_recorrentes%rowtype; novo text; mudou boolean := false; car integer;
begin
  select * into a from crm.assinaturas_recorrentes where id = p_assinatura_id for update;
  if not found then raise exception 'assinatura_nao_encontrada'; end if;
  if a.status_financeiro in ('cancelado', 'encerrado') then return 'terminal'; end if;
  car := crm.carencia_dias_recorrencia(a.empresa_id);

  novo := case p_status_provedor
            when 'authorized' then 'ativo'
            when 'paused' then 'inadimplente'
            when 'cancelled' then 'cancelado'
            else a.status_financeiro end;
  mudou := novo is distinct from a.status_financeiro;

  update crm.assinaturas_recorrentes set
    provider_subscription_id = coalesce(provider_subscription_id, p_provider_subscription_id),
    status_provedor = p_status_provedor,
    status_financeiro = novo,
    inicio_em = case when novo = 'ativo' then coalesce(inicio_em, p_inicio, now()) else inicio_em end,
    proxima_cobranca_em = coalesce(p_proxima, proxima_cobranca_em),
    carencia_ate = case when novo = 'ativo' then null
                        when novo = 'inadimplente' then coalesce(carencia_ate, now() + make_interval(days => car))
                        else carencia_ate end,
    cancelado_em = case when novo = 'cancelado' then coalesce(cancelado_em, now()) else cancelado_em end,
    cancelamento_origem = case when novo = 'cancelado' then coalesce(cancelamento_origem, 'provedor') else cancelamento_origem end,
    cancelamento_motivo = case when novo = 'cancelado' then coalesce(cancelamento_motivo, p_motivo) else cancelamento_motivo end,
    site_status = case when not site_status_manual then crm.site_status_automatico(novo,
      case when novo = 'inadimplente' then coalesce(carencia_ate, now() + make_interval(days => car)) else carencia_ate end)
      else site_status end
  where id = a.id;

  if mudou then
    insert into crm.atividades (empresa_id, contrato_id, contato_id, tipo, titulo, metadata)
    values (a.empresa_id, a.contrato_id, a.contato_id, 'recorrencia_' || novo,
            case novo when 'ativo' then 'Recorrência ativada (confirmada pelo provedor)'
                      when 'inadimplente' then 'Recorrência pausada pelo provedor (inadimplência)'
                      when 'cancelado' then 'Recorrência cancelada' else 'Recorrência atualizada' end,
            jsonb_build_object('status_provedor', p_status_provedor));
  end if;
  return case when mudou then 'alterado' else 'sem_mudanca' end;
end $function$;

-- 7) RPC do painel (CRM autenticado) pra travar/destravar o override manual
--    do site_status -- "tem de ter a opcao de voltar manualmente o site ai
--    eu corrijo enquanto entendo e ajusto o pagamento".
create or replace function crm.definir_site_status_manual(p_assinatura_id uuid, p_site_status text, p_manual boolean)
returns crm.assinaturas_recorrentes
language plpgsql security definer set search_path = 'crm', 'public' as $$
declare
  v_empresa uuid;
  v_result crm.assinaturas_recorrentes;
begin
  select empresa_id into v_empresa from crm.assinaturas_recorrentes where id = p_assinatura_id;
  if v_empresa is null then raise exception 'Assinatura nao encontrada.'; end if;
  if not (crm.tem_permissao(auth.uid(), v_empresa, 'contratos', 'editar') or crm.tem_permissao(auth.uid(), v_empresa, 'financeiro', 'editar')) then
    raise exception 'Sem permissao.';
  end if;
  if p_site_status not in ('nao_aplicavel', 'no_ar', 'suspenso') then raise exception 'site_status invalido.'; end if;

  update crm.assinaturas_recorrentes set site_status = p_site_status, site_status_manual = p_manual, updated_at = now()
  where id = p_assinatura_id
  returning * into v_result;

  insert into crm.atividades (empresa_id, contrato_id, contato_id, tipo, titulo, metadata)
  values (v_result.empresa_id, v_result.contrato_id, v_result.contato_id, 'site_status_manual',
    case when p_manual then 'Site marcado manualmente como ' || p_site_status || ' (automacao pausada)'
         else 'Site devolvido pro controle automatico' end,
    jsonb_build_object('site_status', p_site_status, 'manual', p_manual));

  return v_result;
end; $$;
revoke execute on function crm.definir_site_status_manual(uuid, text, boolean) from public;
grant execute on function crm.definir_site_status_manual(uuid, text, boolean) to authenticated;
