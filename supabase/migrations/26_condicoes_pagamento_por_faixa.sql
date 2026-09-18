-- Contratos — Migration 26
-- Duas condicoes de pagamento novas (por faixa de valor):
--  sinal_gravacao: 20% sinal + 80% ate a primeira sessao de gravacao
--  sinal_40_40: 20% sinal + 40% ate a primeira gravacao + 40% em ate 7 dias corridos da entrega
alter table crm.contratos drop constraint contratos_condicao_pagamento_tipo_check;
alter table crm.contratos
  add constraint contratos_condicao_pagamento_tipo_check check (
    condicao_pagamento_tipo is null or condicao_pagamento_tipo in (
      'avista', 'sinal_saldo', 'parcelado_semanal', 'parcelado_mensal',
      'cinquenta_gravacao_entrega', 'cinquenta_contratacao_entrega',
      'sinal_gravacao', 'sinal_40_40', 'personalizado'
    )
  );
