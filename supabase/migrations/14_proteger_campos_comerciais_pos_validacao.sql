-- Contratos — Migration 14
-- Bug real encontrado no teste E2E completo: o trigger de bloqueio
-- pos-validacao protegia a coluna legada "valor", mas NUNCA foi
-- atualizado quando valor_tabela_total/valor_negociado_total/
-- desconto_total/condicoes_pagamento_texto/condicoes_especiais
-- foram adicionadas (migration 02). Resultado: um contrato validado
-- podia ter seus totais comerciais alterados por qualquer editor,
-- quebrando a garantia central de snapshot congelado.

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
       or new.valor_tabela_total is distinct from old.valor_tabela_total
       or new.valor_negociado_total is distinct from old.valor_negociado_total
       or new.desconto_total is distinct from old.desconto_total
       or new.condicoes_pagamento_texto is distinct from old.condicoes_pagamento_texto
       or new.condicoes_especiais is distinct from old.condicoes_especiais
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
