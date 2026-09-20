-- Catálogo — Migration 41
-- Preço de criação da Landing Page — Próprio: R$ 1.490 (antes 1.500).
-- Contratos já criados mantêm o valor da época (snapshot em contrato_itens).
update crm.produtos_servicos set preco_padrao = 1490.00
where empresa_id = (select id from crm.empresas where slug = 'criativamente') and nome = 'Criação de Landing Page — Próprio';
