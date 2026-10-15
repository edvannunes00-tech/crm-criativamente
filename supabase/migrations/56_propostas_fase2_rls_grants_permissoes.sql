alter table crm.propostas enable row level security;
alter table crm.proposta_itens enable row level security;
alter table crm.proposta_bonus enable row level security;
alter table crm.proposta_versoes enable row level security;
alter table crm.proposta_links enable row level security;

create policy "propostas_select" on crm.propostas for select to authenticated using (
  (empresa_id in (select crm.minhas_empresas_ativas())) and crm.tem_permissao(auth.uid(), empresa_id, 'propostas', 'visualizar')
);
create policy "propostas_insert" on crm.propostas for insert to authenticated with check (
  crm.tem_permissao(auth.uid(), empresa_id, 'propostas', 'criar')
);
create policy "propostas_update" on crm.propostas for update to authenticated using (
  crm.tem_permissao(auth.uid(), empresa_id, 'propostas', 'editar')
);
create policy "propostas_delete" on crm.propostas for delete to authenticated using (
  crm.tem_permissao(auth.uid(), empresa_id, 'propostas', 'excluir')
);

create policy "proposta_itens_select" on crm.proposta_itens for select to authenticated using (
  (empresa_id in (select crm.minhas_empresas_ativas())) and crm.tem_permissao(auth.uid(), empresa_id, 'propostas', 'visualizar')
);
create policy "proposta_itens_insert" on crm.proposta_itens for insert to authenticated with check (
  crm.tem_permissao(auth.uid(), empresa_id, 'propostas', 'criar')
);
create policy "proposta_itens_update" on crm.proposta_itens for update to authenticated using (
  crm.tem_permissao(auth.uid(), empresa_id, 'propostas', 'editar')
);
create policy "proposta_itens_delete" on crm.proposta_itens for delete to authenticated using (
  crm.tem_permissao(auth.uid(), empresa_id, 'propostas', 'editar')
);

create policy "proposta_bonus_select" on crm.proposta_bonus for select to authenticated using (
  (empresa_id in (select crm.minhas_empresas_ativas())) and crm.tem_permissao(auth.uid(), empresa_id, 'propostas', 'visualizar')
);
create policy "proposta_bonus_insert" on crm.proposta_bonus for insert to authenticated with check (
  crm.tem_permissao(auth.uid(), empresa_id, 'propostas', 'criar')
);
create policy "proposta_bonus_update" on crm.proposta_bonus for update to authenticated using (
  crm.tem_permissao(auth.uid(), empresa_id, 'propostas', 'editar')
);
create policy "proposta_bonus_delete" on crm.proposta_bonus for delete to authenticated using (
  crm.tem_permissao(auth.uid(), empresa_id, 'propostas', 'editar')
);

create policy "proposta_versoes_select" on crm.proposta_versoes for select to authenticated using (
  (empresa_id in (select crm.minhas_empresas_ativas())) and crm.tem_permissao(auth.uid(), empresa_id, 'propostas', 'visualizar')
);
create policy "proposta_versoes_insert" on crm.proposta_versoes for insert to authenticated with check (
  crm.tem_permissao(auth.uid(), empresa_id, 'propostas', 'criar') or crm.tem_permissao(auth.uid(), empresa_id, 'propostas', 'editar')
);

create policy "proposta_links_select" on crm.proposta_links for select to authenticated using (
  (empresa_id in (select crm.minhas_empresas_ativas())) and crm.tem_permissao(auth.uid(), empresa_id, 'propostas', 'visualizar')
);
create policy "proposta_links_insert" on crm.proposta_links for insert to authenticated with check (
  crm.tem_permissao(auth.uid(), empresa_id, 'propostas', 'criar')
);
create policy "proposta_links_update" on crm.proposta_links for update to authenticated using (
  crm.tem_permissao(auth.uid(), empresa_id, 'propostas', 'editar')
);

grant select, insert, update, delete on crm.propostas to authenticated;
grant select, insert, update, delete on crm.proposta_itens to authenticated;
grant select, insert, update, delete on crm.proposta_bonus to authenticated;
grant select, insert on crm.proposta_versoes to authenticated;
grant select, insert, update on crm.proposta_links to authenticated;

grant all on crm.propostas, crm.proposta_itens, crm.proposta_bonus, crm.proposta_versoes, crm.proposta_links to service_role;

-- Seed de permissões, mesmo padrão já usado pro módulo 'tarefas': Administrador com
-- tudo, Produto e Vendedor com visualizar/criar/editar (sem excluir/exportar/administrar).
insert into crm.papel_permissoes (papel_id, modulo_id, acao, permitido)
select pa.id, m.id, acao.nome::crm.acao_permissao, true
from crm.papeis pa
cross join crm.modulos m
cross join (values ('visualizar'), ('criar'), ('editar'), ('excluir'), ('exportar'), ('administrar')) as acao(nome)
where pa.nome = 'Administrador' and m.chave = 'propostas'
on conflict (papel_id, modulo_id, acao) do update set permitido = true;

insert into crm.papel_permissoes (papel_id, modulo_id, acao, permitido)
select pa.id, m.id, acao.nome::crm.acao_permissao, true
from crm.papeis pa
cross join crm.modulos m
cross join (values ('visualizar'), ('criar'), ('editar')) as acao(nome)
where pa.nome in ('Produto', 'Vendedor') and m.chave = 'propostas'
on conflict (papel_id, modulo_id, acao) do update set permitido = true;
