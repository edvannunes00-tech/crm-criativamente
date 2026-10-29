create view treinamento.vw_perguntas_aluno
with (security_invoker = true) as
select p.id, p.questionario_id, p.enunciado, p.ordem,
       a.id as alternativa_id, a.texto as alternativa_texto, a.ordem as alternativa_ordem
from treinamento.perguntas p
join treinamento.alternativas a on a.pergunta_id = p.id
order by p.ordem, a.ordem;

grant select on treinamento.vw_perguntas_aluno to authenticated;

create or replace function treinamento.submeter_questionario(p_questionario_id uuid, p_respostas jsonb)
returns table (percentual_acerto integer, aprovado boolean)
language plpgsql security definer set search_path = treinamento, public as $$
declare
  v_aula_id uuid;
  v_percentual_aprovacao integer;
  v_total integer;
  v_acertos integer := 0;
  v_pergunta record;
  v_alternativa_escolhida uuid;
  v_correta boolean;
  v_percentual integer;
  v_aprovado boolean;
begin
  select aula_id, percentual_aprovacao into v_aula_id, v_percentual_aprovacao
  from treinamento.questionarios where id = p_questionario_id;
  if v_aula_id is null then
    raise exception 'questionario_nao_encontrado';
  end if;

  select count(*) into v_total from treinamento.perguntas where questionario_id = p_questionario_id;
  if v_total = 0 then
    raise exception 'questionario_sem_perguntas';
  end if;

  for v_pergunta in select id from treinamento.perguntas where questionario_id = p_questionario_id loop
    v_alternativa_escolhida := (p_respostas ->> v_pergunta.id::text)::uuid;
    select correta into v_correta from treinamento.alternativas
      where id = v_alternativa_escolhida and pergunta_id = v_pergunta.id;
    if coalesce(v_correta, false) then
      v_acertos := v_acertos + 1;
    end if;
  end loop;

  v_percentual := round((v_acertos::numeric / v_total::numeric) * 100);
  v_aprovado := v_percentual >= v_percentual_aprovacao;

  insert into treinamento.tentativas_questionario (aluno_id, questionario_id, respostas, percentual_acerto, aprovado)
  values (auth.uid(), p_questionario_id, p_respostas, v_percentual, v_aprovado);

  if v_aprovado then
    insert into treinamento.progresso_aulas (aluno_id, aula_id, percentual_assistido, concluida, concluida_em)
    values (auth.uid(), v_aula_id, 0, true, now())
    on conflict (aluno_id, aula_id) do update
      set concluida = true, concluida_em = coalesce(treinamento.progresso_aulas.concluida_em, now());
  end if;

  return query select v_percentual, v_aprovado;
end;
$$;

grant execute on function treinamento.submeter_questionario(uuid, jsonb) to authenticated;
