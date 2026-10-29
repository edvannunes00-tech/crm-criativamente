-- RECONSTRUÇÃO (2026-10-12): este arquivo foi recuperado a partir do estado ATUAL do banco
-- (pg_get_functiondef), não do texto original da migration aplicada em produção. O comportamento
-- reproduzido aqui é fiel ao que está rodando hoje; nomes internos de constraint/índice gerados
-- automaticamente pelo Postgres podem diferir do original, mas não afetam o funcionamento.
--
-- Objetivo original (pela auditoria/memória da sessão): quando um contrato muda para
-- status = 'assinado' (via assinatura pública OU upload manual), avançar automaticamente
-- o status_relacionamento do contato (Lead -> Cliente) e a etapa da oportunidade vinculada
-- para a etapa de Ganho, registrando uma atividade explicando o que foi feito.

create or replace function crm.pos_assinatura_contrato()
returns trigger
language plpgsql
security definer
set search_path to 'crm', 'public'
as $function$
declare
  v_etapa_ganho uuid;
begin
  if new.contato_id is not null then
    update crm.contatos set status_relacionamento = 'Cliente'
      where id = new.contato_id and status_relacionamento = 'Lead';
  end if;

  if new.oportunidade_id is not null then
    select id into v_etapa_ganho from crm.pipeline_etapas
      where empresa_id = new.empresa_id and is_ganho = true
      order by ordem limit 1;
    if v_etapa_ganho is not null then
      update crm.oportunidades
        set etapa_id = v_etapa_ganho, data_fechamento = coalesce(data_fechamento, now()), valor_final = coalesce(valor_final, valor_estimado)
        where id = new.oportunidade_id and etapa_id is distinct from v_etapa_ganho;
    end if;
  end if;

  insert into crm.atividades (empresa_id, contrato_id, contato_id, oportunidade_id, tipo, titulo, descricao)
    values (new.empresa_id, new.id, new.contato_id, new.oportunidade_id, 'contrato_assinado_automacao',
      'Cliente e oportunidade atualizados automaticamente',
      'O contrato foi assinado: o status do cliente avançou para "Cliente" (se ainda estava como Lead) e a oportunidade vinculada avançou para a etapa de Ganho.');

  return new;
end
$function$;

drop trigger if exists trg_pos_assinatura_contrato on crm.contratos;
create trigger trg_pos_assinatura_contrato
  after update of status on crm.contratos
  for each row
  when (new.status = 'assinado' and old.status is distinct from 'assinado')
  execute function crm.pos_assinatura_contrato();
