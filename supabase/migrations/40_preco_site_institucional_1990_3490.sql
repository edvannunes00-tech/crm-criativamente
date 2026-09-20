-- Catálogo — Migration 40
-- Preço de criação do Site Institucional Completo: Gerenciado R$ 1.990 (antes 2.000) e Próprio R$ 3.490 (antes 3.500).
-- Contratos já criados mantêm o valor da época (snapshot em contrato_itens).
update crm.produtos_servicos set preco_padrao = 1990.00
where empresa_id = (select id from crm.empresas where slug = 'criativamente') and nome = 'Criação de Site Institucional Completo — Gerenciado';
update crm.produtos_servicos set preco_padrao = 3490.00
where empresa_id = (select id from crm.empresas where slug = 'criativamente') and nome = 'Criação de Site Institucional Completo — Próprio';
