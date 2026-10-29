-- Expõe o schema treinamento na API (PostgREST), igual ao já feito para crm/afiliados
-- em "expor_schema_crm_para_api". Esta alteração foi originalmente aplicada via execute_sql
-- direto (não via apply_migration), por isso não tinha arquivo correspondente até agora.
ALTER ROLE authenticator SET pgrst.db_schemas = 'public, crm, afiliados, treinamento';
NOTIFY pgrst, 'reload config';
