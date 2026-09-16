-- Contratos — Migration 09
-- Seed idempotente de permissões para o módulo "contratos" (já cadastrado
-- em crm.modulos, chave 'contratos'). Usa ON CONFLICT DO NOTHING sobre a
-- unique key existente (papel_id, modulo_id, acao) — não duplica nem
-- sobrescreve nada, inclusive o que já está configurado hoje:
--   Administrador: visualizar, criar, editar, excluir, exportar, administrar (já existe, intacto)
--   Vendedor: visualizar (já existe, intacto)
--
-- Este seed SÓ adiciona o que ainda falta, e SÓ para o módulo 'contratos' —
-- nenhuma outra linha de nenhum outro módulo é tocada.
--
-- Proposta de default (ajustável depois pela própria tela de Permissões,
-- sem precisar de nova migration):
--   Vendedor: + criar, editar (monta e envia contrato, não valida/exclui/administra)
--   Financeiro: + visualizar, exportar (acompanha e concilia, não edita)
--   Produto: nenhuma linha nova — time de entrega não mexe em contrato comercial

insert into crm.papel_permissoes (papel_id, modulo_id, acao, permitido)
select p.id, m.id, acao.valor::crm.acao_permissao, true
from crm.papeis p
cross join crm.modulos m
cross join (values ('criar'), ('editar')) as acao(valor)
where m.chave = 'contratos'
  and p.nome = 'Vendedor'
on conflict (papel_id, modulo_id, acao) do nothing;

insert into crm.papel_permissoes (papel_id, modulo_id, acao, permitido)
select p.id, m.id, acao.valor::crm.acao_permissao, true
from crm.papeis p
cross join crm.modulos m
cross join (values ('visualizar'), ('exportar')) as acao(valor)
where m.chave = 'contratos'
  and p.nome = 'Financeiro'
on conflict (papel_id, modulo_id, acao) do nothing;
