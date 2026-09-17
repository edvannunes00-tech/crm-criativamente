-- Contratos — Migration 16
-- Estende a mesma protecao pos-validacao (migration 14) para os campos
-- novos de condicao de pagamento estruturada (migration 15), evitando
-- repetir o gap ja encontrado antes com valor_tabela_total etc.

create or replace function crm.bloquear_edicao_contrato_validado()
returns trigger
language plpgsql
security definer
set search_path to 'crm', 'public'
as $$
begin
  if old.status = 'validado'
     and not crm.tem_permissao(auth.uid(), old.empresa_id, 'contratos', 'administrar') then
    if new.valor is distinct from old.valor
       or new.valor_tabela_total is distinct from old.valor_tabela_total
       or new.valor_negociado_total is distinct from old.valor_negociado_total
       or new.desconto_total is distinct from old.desconto_total
       or new.condicoes_pagamento_texto is distinct from old.condicoes_pagamento_texto
       or new.condicoes_especiais is distinct from old.condicoes_especiais
       or new.condicao_pagamento_tipo is distinct from old.condicao_pagamento_tipo
       or new.condicao_pagamento_percentual_entrada is distinct from old.condicao_pagamento_percentual_entrada
       or new.forma_pagamento is distinct from old.forma_pagamento
       or new.forma_pagamento_outro_descricao is distinct from old.forma_pagamento_outro_descricao
       or new.parcelas_quantidade is distinct from old.parcelas_quantidade
       or new.parcelas_periodicidade is distinct from old.parcelas_periodicidade
       or new.parcelas_observacao is distinct from old.parcelas_observacao
       or new.oportunidade_id is distinct from old.oportunidade_id
       or new.contato_id is distinct from old.contato_id
       or (new.status is distinct from old.status and new.status <> 'cancelado') then
      raise exception 'Este contrato já foi validado. Só quem tem permissão de administrar contratos pode alterá-lo.';
    end if;
  end if;

  if new.status = 'validado' and old.status is distinct from 'validado'
     and not crm.tem_permissao(auth.uid(), new.empresa_id, 'contratos', 'administrar') then
    raise exception 'Somente quem tem permissão de administrar contratos pode validar um contrato.';
  end if;

  return new;
end;
$$;
