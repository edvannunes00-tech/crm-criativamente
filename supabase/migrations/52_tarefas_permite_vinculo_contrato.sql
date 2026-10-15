-- A tela de tarefas (tarefas.html) sempre ofereceu "Contrato" como opção de vínculo,
-- mas o CHECK constraint nunca permitiu esse valor -- vincular uma tarefa a um contrato
-- sempre teria dado erro de constraint ao salvar.

alter table crm.tarefas drop constraint tarefas_vinculo_tipo_check;
alter table crm.tarefas add constraint tarefas_vinculo_tipo_check
  check (vinculo_tipo = any (array['lead','cliente','contato','oportunidade','contrato','projeto','projeto_etapa','financeiro','interna']));
