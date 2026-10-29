-- RECONSTRUÇÃO (2026-10-12): esta migration NÃO pôde ser recuperada em texto original —
-- o papel "Consulta" que ela criou foi posteriormente RENOMEADO para "Comercial" pela
-- migration 48 (upgrade de permissões), então a linha original não existe mais isolada
-- no banco para inspecionar. O que segue é uma reconstrução plausível baseada na
-- descrição funcional registrada na auditoria: um papel novo, somente leitura
-- (visualizar), nos mesmos 5 módulos que a Comercial (atual) teria mais tarde.
--
-- Se este arquivo for reaplicado tal como está num banco que já passou pela 48,
-- ele é redundante (o papel já existe como "Comercial") — serve como registro
-- histórico do que aconteceu, não para reaplicação literal.

insert into crm.papeis (empresa_id, nome)
select id, 'Consulta' from crm.empresas
on conflict do nothing;

-- Permissão de 'visualizar' nos módulos leads, clientes, oportunidades, contratos, pipeline
-- (mesmo conjunto de módulos da papel Comercial atual, só que sem criar/editar).
