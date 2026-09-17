-- Contratos — Migration 15
-- Estrutura condicoes de pagamento sem quebrar nada existente:
-- condicoes_pagamento_texto continua existindo e sendo o que o PDF e a
-- pagina publica ja leem hoje -- passa a ser um RESUMO gerado no
-- frontend a partir dos campos estruturados abaixo, nunca mais digitado
-- 100% livre (exceto no tipo "personalizado").
--
-- Aditivo, nao destrutivo. Nenhuma coluna existente removida/alterada.

alter table crm.contratos
  add column condicao_pagamento_tipo text,
  add column condicao_pagamento_percentual_entrada numeric(5,2),
  add column forma_pagamento text,
  add column forma_pagamento_outro_descricao text,
  add column parcelas_quantidade integer,
  add column parcelas_periodicidade text,
  add column parcelas_observacao text;

alter table crm.contratos
  add constraint contratos_condicao_pagamento_tipo_check check (
    condicao_pagamento_tipo is null or condicao_pagamento_tipo in (
      'avista', 'sinal_saldo', 'parcelado_semanal', 'parcelado_mensal',
      'cinquenta_gravacao_entrega', 'cinquenta_contratacao_entrega', 'personalizado'
    )
  ),
  add constraint contratos_percentual_entrada_check check (
    condicao_pagamento_percentual_entrada is null
    or (condicao_pagamento_percentual_entrada > 0 and condicao_pagamento_percentual_entrada <= 100)
  ),
  add constraint contratos_forma_pagamento_check check (
    forma_pagamento is null or forma_pagamento in ('pix', 'cartao', 'pix_parcelado', 'dinheiro', 'transferencia', 'outro')
  ),
  add constraint contratos_parcelas_periodicidade_check check (
    parcelas_periodicidade is null or parcelas_periodicidade in ('semanal', 'mensal')
  ),
  add constraint contratos_parcelas_quantidade_check check (
    parcelas_quantidade is null or parcelas_quantidade > 0
  );
