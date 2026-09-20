-- Aplicada via apply_migration: service_role ganha SELECT em crm.empresas e crm.empresa_usuarios e
-- SELECT/INSERT em crm.atividades (as Edge Functions liam/gravavam essas tabelas e falhavam em silencio).
grant select on crm.empresas to service_role;
grant select on crm.empresa_usuarios to service_role;
grant select, insert on crm.atividades to service_role;
