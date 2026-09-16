-- Contratos — Migration 08
-- RLS das 5 tabelas novas. Mesmo padrão já usado em crm.contratos/documentos:
-- tenant isolation via empresa_id (coluna própria em cada tabela, não via
-- join — contrato_id sozinho nunca é suficiente para provar o tenant) +
-- crm.tem_permissao(auth.uid(), empresa_id, modulo, acao).
--
-- Nenhuma policy é criada para o papel "anon" em nenhuma das 5 tabelas.
-- O fluxo público (contrato-publico, segunda-via) nunca lerá/escreverá
-- estas tabelas com a chave publicável — sempre via Edge Function com
-- service_role, que ignora RLS por definição.

alter table crm.contrato_itens enable row level security;
alter table crm.contrato_bonus enable row level security;
alter table crm.contrato_dados_cliente enable row level security;
alter table crm.contrato_links enable row level security;
alter table crm.contrato_segunda_via_solicitacoes enable row level security;

-- ===================== contrato_itens =====================
create policy contrato_itens_select on crm.contrato_itens
  for select
  using (
    empresa_id in (select crm.minhas_empresas_ativas())
    and crm.tem_permissao(auth.uid(), empresa_id, 'contratos', 'visualizar')
  );

create policy contrato_itens_insert on crm.contrato_itens
  for insert
  with check (crm.tem_permissao(auth.uid(), empresa_id, 'contratos', 'criar'));

create policy contrato_itens_update on crm.contrato_itens
  for update
  using (crm.tem_permissao(auth.uid(), empresa_id, 'contratos', 'editar'));

create policy contrato_itens_delete on crm.contrato_itens
  for delete
  using (crm.tem_permissao(auth.uid(), empresa_id, 'contratos', 'editar'));

-- ===================== contrato_bonus =====================
create policy contrato_bonus_select on crm.contrato_bonus
  for select
  using (
    empresa_id in (select crm.minhas_empresas_ativas())
    and crm.tem_permissao(auth.uid(), empresa_id, 'contratos', 'visualizar')
  );

create policy contrato_bonus_insert on crm.contrato_bonus
  for insert
  with check (crm.tem_permissao(auth.uid(), empresa_id, 'contratos', 'criar'));

create policy contrato_bonus_update on crm.contrato_bonus
  for update
  using (crm.tem_permissao(auth.uid(), empresa_id, 'contratos', 'editar'));

create policy contrato_bonus_delete on crm.contrato_bonus
  for delete
  using (crm.tem_permissao(auth.uid(), empresa_id, 'contratos', 'editar'));

-- ================= contrato_dados_cliente ==================
-- Só CRM interno lê/edita por aqui. A escrita originada do cliente externo
-- acontece exclusivamente pelas funções crm.salvar_rascunho_dados_contrato()
-- e crm.confirmar_dados_contrato() (migration 10), chamadas pela Edge
-- Function com service_role — nunca por INSERT/UPDATE direto de um usuário
-- autenticado comum.
create policy contrato_dados_cliente_select on crm.contrato_dados_cliente
  for select
  using (
    empresa_id in (select crm.minhas_empresas_ativas())
    and crm.tem_permissao(auth.uid(), empresa_id, 'contratos', 'visualizar')
  );

create policy contrato_dados_cliente_update on crm.contrato_dados_cliente
  for update
  using (crm.tem_permissao(auth.uid(), empresa_id, 'contratos', 'editar'));

-- ===================== contrato_links =====================
create policy contrato_links_select on crm.contrato_links
  for select
  using (
    empresa_id in (select crm.minhas_empresas_ativas())
    and crm.tem_permissao(auth.uid(), empresa_id, 'contratos', 'visualizar')
  );

create policy contrato_links_insert on crm.contrato_links
  for insert
  with check (crm.tem_permissao(auth.uid(), empresa_id, 'contratos', 'criar'));

-- UPDATE cobre a revogação manual feita pela equipe (status -> revogado).
-- A confirmação vinda do cliente passa pela função SECURITY DEFINER, não
-- por esta policy.
create policy contrato_links_update on crm.contrato_links
  for update
  using (crm.tem_permissao(auth.uid(), empresa_id, 'contratos', 'editar'));

-- ============ contrato_segunda_via_solicitacoes =============
-- Somente leitura, somente para quem administra contratos, e somente das
-- linhas já associadas a um contrato da própria empresa. Tentativas sem
-- contrato/empresa identificados (CPF errado, etc.) não ficam visíveis a
-- ninguém via RLS — só a service_role, que já ignora RLS por padrão.
create policy contrato_segunda_via_select on crm.contrato_segunda_via_solicitacoes
  for select
  using (
    empresa_id is not null
    and empresa_id in (select crm.minhas_empresas_ativas())
    and crm.tem_permissao(auth.uid(), empresa_id, 'contratos', 'administrar')
  );

-- Sem policy de INSERT/UPDATE/DELETE para usuários autenticados comuns:
-- só a Edge Function (service_role) escreve nesta tabela.
