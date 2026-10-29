-- RECONSTRUÇÃO (2026-10-12): confirmado via information_schema.role_table_grants que
-- service_role tem hoje exatamente SELECT, INSERT, UPDATE em crm.convites_usuario
-- (sem DELETE) -- bate com o que foi descrito na auditoria (bug de convite de usuário
-- silenciosamente falhando por falta desse grant).

GRANT SELECT, INSERT, UPDATE ON crm.convites_usuario TO service_role;
