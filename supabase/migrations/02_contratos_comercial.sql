-- Contratos — Migration 02
-- Campos comerciais do contrato (preço de tabela x negociado x desconto x condições).
-- Escala decimal (12,2) segue o padrão já usado em oportunidade_itens.
-- Estes valores são preenchidos pela aplicação no momento da criação/edição do
-- contrato (soma dos itens em contrato_itens) e NUNCA recalculados a partir do
-- preço vigente do catálogo — são snapshot histórico, não coluna gerada.

alter table crm.contratos
  add column valor_tabela_total numeric(12,2),
  add column valor_negociado_total numeric(12,2),
  add column desconto_total numeric(12,2) not null default 0,
  add column condicoes_pagamento_texto text,
  add column condicoes_especiais text,
  add column observacoes text;

alter table crm.contratos
  add constraint contratos_valor_tabela_total_check check (valor_tabela_total is null or valor_tabela_total >= 0),
  add constraint contratos_valor_negociado_total_check check (valor_negociado_total is null or valor_negociado_total >= 0),
  add constraint contratos_desconto_total_check check (desconto_total >= 0);
