grant usage on schema treinamento to authenticated, service_role;

grant select on treinamento.liderancas to authenticated;
grant select, insert, update on treinamento.alunos to authenticated;
grant select, insert, update, delete on treinamento.modulos to authenticated;
grant select, insert, update, delete on treinamento.aulas to authenticated;
grant select, insert, update, delete on treinamento.questionarios to authenticated;
grant select, insert, update, delete on treinamento.perguntas to authenticated;
grant select, insert, update, delete on treinamento.alternativas to authenticated;
grant select, insert, update, delete on treinamento.acessos_modulo to authenticated;
grant select, insert, update on treinamento.progresso_aulas to authenticated;
grant select on treinamento.tentativas_questionario to authenticated;
grant select, insert on treinamento.acessos_log to authenticated;

grant all on all tables in schema treinamento to service_role;
grant all on all sequences in schema treinamento to service_role;
