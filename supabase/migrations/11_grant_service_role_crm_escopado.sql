-- Contratos — Migration 11
-- Corrige o bloqueio estrutural encontrado: service_role nao tinha USAGE
-- no schema crm (nem SELECT/INSERT/UPDATE em nenhuma tabela dele), o que
-- impede QUALQUER Edge Function usando o client admin de tocar em crm.*
-- (nao e um problema so de contratos -- convidar-usuario tem o mesmo
-- padrao e provavelmente ja falha silenciosamente hoje; registrado como
-- divida tecnica separada, nao corrigido aqui).
--
-- Escopo restrito (nao "ALL TABLES IN SCHEMA crm"): so as 9 tabelas que
-- as 4 Edge Functions de contrato (aprovadas) realmente tocam direto,
-- e sem DELETE em nenhuma (nenhuma delas apaga linha). EXECUTE listado
-- explicitamente so nas funcoes chamadas, ainda que ja funcionasse via
-- PUBLIC -- blindagem contra um futuro REVOKE FROM PUBLIC.
--
-- Nao remove nem reduz nenhum privilegio existente. Nao mexe em RLS.
-- Nao altera nenhuma tabela, constraint ou funcao.

grant usage on schema crm to service_role;

grant select on
  crm.contratos,
  crm.contrato_itens,
  crm.contrato_bonus,
  crm.contrato_dados_cliente,
  crm.contratos_versoes,
  crm.documentos
to service_role;

grant select, insert on
  crm.contrato_links,
  crm.contrato_segunda_via_solicitacoes
to service_role;

grant update on crm.contrato_links to service_role;

grant insert on crm.atividades to service_role;

grant execute on function crm.tem_permissao(uuid, uuid, text, crm.acao_permissao) to service_role;
grant execute on function crm.registrar_acesso_link_contrato(text) to service_role;
grant execute on function crm.salvar_rascunho_dados_contrato(text, text, text, text, text, text, text, text, text, text, text, text) to service_role;
grant execute on function crm.confirmar_dados_contrato(text) to service_role;
