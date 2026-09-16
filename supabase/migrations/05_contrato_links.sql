-- Contratos — Migration 05
-- Link público seguro. Token cru NUNCA é persistido — só o hash (sha-256,
-- calculado pela Edge Function antes de qualquer INSERT/SELECT).
--
-- Regra de transição de status — NÃO confiar em CHECK sozinho:
-- um CHECK do Postgres valida o estado de UMA linha, não compara OLD x NEW.
-- Por isso a transição unidirecional (ativo -> confirmado|expirado|revogado,
-- nunca de volta) é garantida por TRIGGER BEFORE UPDATE, e o CHECK cuida
-- apenas de restringir os valores possíveis da coluna.

create table crm.contrato_links (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references crm.empresas(id) on delete cascade,
  contrato_id uuid not null references crm.contratos(id) on delete cascade,
  token_hash text not null unique,
  status text not null default 'ativo',
  created_at timestamptz not null default now(),
  created_by uuid references crm.usuarios(id),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revoked_by uuid references crm.usuarios(id),
  motivo_revogacao text,
  last_access_at timestamptz,
  access_count integer not null default 0,
  confirmado_em timestamptz,
  constraint contrato_links_status_check check (status in ('ativo', 'confirmado', 'expirado', 'revogado')),
  constraint contrato_links_access_count_check check (access_count >= 0),
  constraint contrato_links_expires_check check (expires_at > created_at),
  constraint contrato_links_revogado_coerente check (
    (status = 'revogado' and revoked_at is not null) or (status <> 'revogado')
  ),
  constraint contrato_links_confirmado_coerente check (
    (status = 'confirmado' and confirmado_em is not null) or (status <> 'confirmado')
  )
);

create index idx_contrato_links_contrato_id on crm.contrato_links (contrato_id);
create index idx_contrato_links_empresa_id on crm.contrato_links (empresa_id);
-- Índice parcial: a consulta mais frequente do fluxo público é
-- "existe link ativo dentro do prazo para este token" — cobre isso direto.
create index idx_contrato_links_ativos on crm.contrato_links (token_hash) where status = 'ativo';

create function crm.trg_before_contrato_link()
returns trigger
language plpgsql
security definer
set search_path to 'crm', 'public'
as $$
declare
  v_empresa_contrato uuid;
begin
  select empresa_id into v_empresa_contrato from crm.contratos where id = new.contrato_id;
  if v_empresa_contrato is distinct from new.empresa_id then
    raise exception 'Link pertence a um contrato de outra empresa (integridade violada).';
  end if;

  if tg_op = 'UPDATE' then
    -- empresa_id/contrato_id/token_hash são imutáveis após a criação.
    if new.empresa_id is distinct from old.empresa_id
       or new.contrato_id is distinct from old.contrato_id
       or new.token_hash is distinct from old.token_hash then
      raise exception 'Campos de identidade do link não podem ser alterados.';
    end if;

    -- Transição unidirecional: uma vez fora de "ativo", o status é definitivo.
    if old.status <> 'ativo' and new.status is distinct from old.status then
      raise exception 'Este link já está em estado final (%) e não pode mudar de status.', old.status;
    end if;

    if old.status = 'ativo' and new.status not in ('ativo', 'confirmado', 'expirado', 'revogado') then
      raise exception 'Transição de status inválida para contrato_links.';
    end if;
  end if;

  return new;
end;
$$;

create trigger trg_before_contrato_link
  before insert or update on crm.contrato_links
  for each row execute function crm.trg_before_contrato_link();

-- Nunca hard-delete de link (é registro de segurança/auditoria) — sem
-- trigger de DELETE porque nenhuma policy de DELETE será criada (seção 8).
