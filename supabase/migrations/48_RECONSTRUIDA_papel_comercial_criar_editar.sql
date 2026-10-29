-- RECONSTRUÇÃO (2026-10-12): recuperado comparando o estado ATUAL de crm.papeis e
-- crm.papel_permissoes com a descrição da auditoria. O papel "Consulta" (criado na
-- 47) foi renomeado para "Comercial" e ganhou as ações 'criar' e 'editar' (mantendo
-- 'visualizar') nos mesmos 5 módulos -- sem 'excluir' nem 'administrar', de propósito
-- (ver auditoria: acesso comercial para convidados externos como a Roberta).
--
-- Estado efetivamente confirmado no banco em 2026-10-12 (papel_id d0dac374-ce41-46d0-920b-a45f75b84ad9,
-- nome 'Comercial'): visualizar+criar+editar = true nos módulos clientes, contratos, leads,
-- oportunidades, pipeline. Nenhuma permissão de excluir/administrar/exportar foi concedida.

update crm.papeis set nome = 'Comercial' where nome = 'Consulta';

insert into crm.papel_permissoes (papel_id, modulo_id, acao, permitido)
select pa.id, m.id, acao.nome, true
from crm.papeis pa
cross join crm.modulos m
cross join (values ('visualizar'), ('criar'), ('editar')) as acao(nome)
where pa.nome = 'Comercial'
  and m.chave in ('leads', 'clientes', 'oportunidades', 'contratos', 'pipeline')
on conflict (papel_id, modulo_id, acao) do update set permitido = true;
