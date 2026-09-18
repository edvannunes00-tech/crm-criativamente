-- Contratos — Migration 25
-- Marco de inicio da contagem do suporte, configuravel por contrato:
-- 'entrega' (padrao, comportamento anterior) ou 'assinatura'.
-- Campo protegido pos-validacao no mesmo trigger dos demais campos comerciais.
alter table crm.contratos
  add column suporte_inicio text not null default 'entrega';

alter table crm.contratos
  add constraint contratos_suporte_inicio_check check (suporte_inicio in ('entrega', 'assinatura'));

-- (bloquear_edicao_contrato_validado recriada com `new.suporte_inicio is distinct from old.suporte_inicio`
-- na lista de campos protegidos -- mesma funcao da migration 16 + este campo)
