-- Contratos — Migration 13
-- Gap de seguranca encontrado ao implementar a tela de validacao:
-- a policy contratos_update so exige 'editar', entao qualquer pessoa
-- com 'editar' conseguia marcar um contrato como 'validado' direto
-- via update (nao so via UI), quando a intencao sempre foi que so
-- quem tem 'administrar' pudesse validar (mesmo padrao ja usado por
-- trg_bloquear_edicao_contrato_validado para editar um contrato JA
-- validado). Adiciona essa checagem na mesma funcao/trigger existente,
-- sem criar trigger novo nem tocar em RLS/policies.

create or replace function crm.bloquear_edicao_contrato_validado()
returns trigger
language plpgsql
security definer
set search_path to 'crm', 'public'
as $$
begin
  if old.status = 'validado'
     and not crm.tem_permissao(auth.uid(), old.empresa_id, 'contratos', 'administrar') then
    if new.valor is distinct from old.valor
       or new.oportunidade_id is distinct from old.oportunidade_id
       or new.contato_id is distinct from old.contato_id
       or (new.status is distinct from old.status and new.status <> 'cancelado') then
      raise exception 'Este contrato já foi validado. Só quem tem permissão de administrar contratos pode alterá-lo.';
    end if;
  end if;

  if new.status = 'validado' and old.status is distinct from 'validado'
     and not crm.tem_permissao(auth.uid(), new.empresa_id, 'contratos', 'administrar') then
    raise exception 'Somente quem tem permissão de administrar contratos pode validar um contrato.';
  end if;

  return new;
end;
$$;
