-- Contratos — Migration 07
-- Log de tentativas de segunda via. Existe para permitir rate limiting e
-- resposta genérica anti-enumeração — por isso grava toda tentativa,
-- inclusive as que falham, sem nunca guardar CPF/CNPJ em texto puro.
--
-- empresa_id fica nullable de propósito: numa tentativa que não bate com
-- nenhum contrato, não há tenant para associar — e é exatamente por isso
-- que nenhuma policy de SELECT libera essas linhas para usuários comuns do
-- CRM (only service_role as opera essa tabela; ver migration 08).

create table crm.contrato_segunda_via_solicitacoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references crm.empresas(id),
  contrato_id uuid references crm.contratos(id) on delete set null,
  cpf_cnpj_hash text not null,
  ip_hash text,
  status text not null default 'pendente',
  created_at timestamptz not null default now(),
  enviado_em timestamptz,
  constraint contrato_segunda_via_status_check check (
    status in ('pendente', 'valido', 'invalido', 'bloqueado_rate_limit', 'enviado', 'falha_envio')
  ),
  constraint contrato_segunda_via_enviado_coerente check (
    (status = 'enviado' and enviado_em is not null) or (status <> 'enviado')
  )
);

-- Suporta as duas consultas centrais do rate limit: "quantas tentativas
-- deste CPF/IP nos últimos N minutos".
create index idx_segunda_via_cpf_hash_created on crm.contrato_segunda_via_solicitacoes (cpf_cnpj_hash, created_at);
create index idx_segunda_via_ip_hash_created on crm.contrato_segunda_via_solicitacoes (ip_hash, created_at);
create index idx_segunda_via_contrato_id on crm.contrato_segunda_via_solicitacoes (contrato_id);

-- Defesa em profundidade: mesmo que só a service_role escreva aqui (RLS não
-- se aplica a ela), se algum dia o código chamador errar o empresa_id de um
-- contrato encontrado, essa linha barra a inconsistência no banco.
create function crm.trg_before_segunda_via_solicitacao()
returns trigger
language plpgsql
security definer
set search_path to 'crm', 'public'
as $$
declare
  v_empresa_contrato uuid;
begin
  if new.contrato_id is not null then
    select empresa_id into v_empresa_contrato from crm.contratos where id = new.contrato_id;
    if v_empresa_contrato is distinct from new.empresa_id then
      raise exception 'Solicitação de segunda via associada a empresa divergente do contrato.';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_before_segunda_via_solicitacao
  before insert or update on crm.contrato_segunda_via_solicitacoes
  for each row execute function crm.trg_before_segunda_via_solicitacao();
