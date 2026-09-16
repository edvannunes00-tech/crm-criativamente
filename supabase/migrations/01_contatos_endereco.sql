-- Contratos — Migration 01
-- Adiciona campos estruturados de endereço ao cadastro do contato.
-- cidade/estado já existem em crm.contatos e são reaproveitados (não duplicados).

alter table crm.contatos
  add column endereco_cep text,
  add column endereco_logradouro text,
  add column endereco_numero text,
  add column endereco_complemento text,
  add column endereco_bairro text;
