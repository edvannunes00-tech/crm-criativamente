-- O trigger já logava conclusão de tarefa em crm.atividades, mas nunca logava a
-- reabertura (status voltando de 'concluida' pra pendente/em_andamento). Estende
-- pra cobrir os dois sentidos, mantendo o mesmo trigger/nome de função.

create or replace function crm.trg_tarefa_concluida()
returns trigger
language plpgsql
security definer
set search_path to 'crm', 'public'
as $function$
declare
  v_contato_id uuid;
  v_oportunidade_id uuid;
  v_projeto_id uuid;
begin
  if TG_OP = 'UPDATE' and new.status is distinct from old.status
     and (new.status = 'concluida' or old.status = 'concluida') then
    if new.vinculo_tipo in ('contato','lead','cliente') then
      v_contato_id := new.vinculo_id;
    elsif new.vinculo_tipo = 'oportunidade' then
      v_oportunidade_id := new.vinculo_id;
      select contato_id into v_contato_id from crm.oportunidades where id = new.vinculo_id;
    elsif new.vinculo_tipo = 'projeto' then
      v_projeto_id := new.vinculo_id;
    end if;

    if new.status = 'concluida' then
      insert into crm.atividades (empresa_id, contato_id, oportunidade_id, projeto_id, tarefa_id, tipo, titulo, descricao, usuario_id)
      values (new.empresa_id, v_contato_id, v_oportunidade_id, v_projeto_id, new.id, 'tarefa_concluida', 'Tarefa concluída', new.titulo, auth.uid());
    else
      insert into crm.atividades (empresa_id, contato_id, oportunidade_id, projeto_id, tarefa_id, tipo, titulo, descricao, usuario_id)
      values (new.empresa_id, v_contato_id, v_oportunidade_id, v_projeto_id, new.id, 'tarefa_reaberta', 'Tarefa reaberta', new.titulo, auth.uid());
    end if;
  end if;
  return new;
end;
$function$;
