-- RECONSTRUÇÃO (2026-10-12): recuperado do estado ATUAL do banco (pg_get_functiondef), não do
-- texto original. Esta é a definição COMPLETA e atual da função (não um diff incremental) --
-- reproduz fielmente o comportamento em produção.
--
-- Objetivo original: quando um pagamento avulso de sinal (crm.contrato_pagamentos_avulsos)
-- transiciona para status = 'aprovado', lançar automaticamente uma parcela em
-- crm.recebimentos (numero_parcela=1/total_parcelas=1, status='recebido'), buscando a
-- forma_pagamento pelo nome ('PIX' ou 'Cartão') e a oportunidade vinculada via o contrato.

create or replace function crm.registrar_pagamento_avulso(
  p_provider_preference_id text,
  p_provider_payment_id text,
  p_status text,
  p_status_provedor text,
  p_valor numeric,
  p_pago_em timestamp with time zone
)
returns text
language plpgsql
security definer
set search_path to 'crm', 'public'
as $function$
declare
  v crm.contrato_pagamentos_avulsos%rowtype;
  v_oportunidade_id uuid;
  v_forma_pagamento_id uuid;
begin
  select * into v from crm.contrato_pagamentos_avulsos where provider_preference_id = p_provider_preference_id order by created_at desc limit 1;
  if not found then return 'pagamento_desconhecido'; end if;
  if v.provider_payment_id is not null and v.provider_payment_id <> p_provider_payment_id then return 'referencia_divergente'; end if;
  if v.status = p_status and v.provider_payment_id = p_provider_payment_id then return 'sem_mudanca'; end if;
  update crm.contrato_pagamentos_avulsos set
    provider_payment_id = p_provider_payment_id, status = p_status, status_provedor = p_status_provedor,
    pago_em = case when p_status = 'aprovado' then coalesce(p_pago_em, now()) else v.pago_em end
  where id = v.id;
  if p_status = 'aprovado' and v.status <> 'aprovado' then
    insert into crm.atividades (empresa_id, contrato_id, tipo, titulo, metadata)
    values (v.empresa_id, v.contrato_id, 'sinal_pago', 'Sinal pago pelo cliente (' || v.metodo || ')', jsonb_build_object('valor', v.valor, 'pagamento_id', v.id));

    select oportunidade_id into v_oportunidade_id from crm.contratos where id = v.contrato_id;
    if v_oportunidade_id is not null then
      select id into v_forma_pagamento_id from crm.formas_pagamento
        where empresa_id = v.empresa_id and nome = (case when v.metodo = 'pix' then 'PIX' else 'Cartão' end)
        limit 1;
      if v_forma_pagamento_id is not null then
        insert into crm.recebimentos (empresa_id, oportunidade_id, forma_pagamento_id, numero_parcela, total_parcelas, valor_bruto, data_prevista, data_efetiva, status, observacao)
        values (v.empresa_id, v_oportunidade_id, v_forma_pagamento_id, 1, 1, coalesce(p_valor, v.valor), coalesce(p_pago_em, now())::date, coalesce(p_pago_em, now())::date, 'recebido', 'Sinal pago via Mercado Pago (' || v.metodo || ').');
      end if;
    end if;
  end if;
  return 'atualizado';
end
$function$;
