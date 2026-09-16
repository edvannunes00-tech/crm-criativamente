-- Contratos — Migration 12
-- Complementa a migration 11: faltou UPDATE em contrato_segunda_via_solicitacoes
-- para service_role. A function contrato-segunda-via precisa avancar o status
-- de 'valido' para 'enviado'/'falha_envio' apos chamar o EmailSender.
-- Estritamente aditivo, uma unica tabela, sem tocar em mais nada.

grant update on crm.contrato_segunda_via_solicitacoes to service_role;
