create table treinamento.acessos_log (
  id uuid primary key default gen_random_uuid(),
  aluno_id uuid not null references treinamento.alunos(id) on delete cascade,
  entrou_em timestamptz not null default now()
);
create index on treinamento.acessos_log (aluno_id, entrou_em desc);

alter table treinamento.liderancas enable row level security;
alter table treinamento.alunos enable row level security;
alter table treinamento.modulos enable row level security;
alter table treinamento.aulas enable row level security;
alter table treinamento.questionarios enable row level security;
alter table treinamento.perguntas enable row level security;
alter table treinamento.alternativas enable row level security;
alter table treinamento.acessos_modulo enable row level security;
alter table treinamento.progresso_aulas enable row level security;
alter table treinamento.tentativas_questionario enable row level security;
alter table treinamento.acessos_log enable row level security;

create or replace function treinamento.eh_lideranca()
returns boolean language sql stable security definer set search_path = treinamento, public as $$
  select exists (select 1 from treinamento.liderancas where id = auth.uid() and ativo);
$$;

create or replace function treinamento.tem_acesso_modulo(p_modulo_id uuid)
returns boolean language sql stable security definer set search_path = treinamento, public as $$
  select exists (
    select 1 from treinamento.acessos_modulo
    where aluno_id = auth.uid() and modulo_id = p_modulo_id
  );
$$;

create policy "liderancas_select" on treinamento.liderancas for select to authenticated using (treinamento.eh_lideranca());

create policy "alunos_select_proprio" on treinamento.alunos for select to authenticated using (id = auth.uid() or treinamento.eh_lideranca());
create policy "alunos_crud_lideranca" on treinamento.alunos for all to authenticated using (treinamento.eh_lideranca()) with check (treinamento.eh_lideranca());

create policy "modulos_select" on treinamento.modulos for select to authenticated using (
  treinamento.eh_lideranca() or (ativo and treinamento.tem_acesso_modulo(id))
);
create policy "modulos_crud_lideranca" on treinamento.modulos for all to authenticated using (treinamento.eh_lideranca()) with check (treinamento.eh_lideranca());

create policy "aulas_select" on treinamento.aulas for select to authenticated using (
  treinamento.eh_lideranca() or (ativo and treinamento.tem_acesso_modulo(modulo_id))
);
create policy "aulas_crud_lideranca" on treinamento.aulas for all to authenticated using (treinamento.eh_lideranca()) with check (treinamento.eh_lideranca());

create policy "questionarios_select_lideranca" on treinamento.questionarios for select to authenticated using (treinamento.eh_lideranca());
create policy "questionarios_crud_lideranca" on treinamento.questionarios for all to authenticated using (treinamento.eh_lideranca()) with check (treinamento.eh_lideranca());

create policy "perguntas_select_lideranca" on treinamento.perguntas for select to authenticated using (treinamento.eh_lideranca());
create policy "perguntas_crud_lideranca" on treinamento.perguntas for all to authenticated using (treinamento.eh_lideranca()) with check (treinamento.eh_lideranca());

create policy "alternativas_select_lideranca" on treinamento.alternativas for select to authenticated using (treinamento.eh_lideranca());
create policy "alternativas_crud_lideranca" on treinamento.alternativas for all to authenticated using (treinamento.eh_lideranca()) with check (treinamento.eh_lideranca());

create policy "acessos_modulo_select" on treinamento.acessos_modulo for select to authenticated using (aluno_id = auth.uid() or treinamento.eh_lideranca());
create policy "acessos_modulo_crud_lideranca" on treinamento.acessos_modulo for all to authenticated using (treinamento.eh_lideranca()) with check (treinamento.eh_lideranca());

create policy "progresso_select" on treinamento.progresso_aulas for select to authenticated using (aluno_id = auth.uid() or treinamento.eh_lideranca());
create policy "progresso_upsert_proprio" on treinamento.progresso_aulas for insert to authenticated with check (aluno_id = auth.uid());
create policy "progresso_update_proprio" on treinamento.progresso_aulas for update to authenticated using (aluno_id = auth.uid()) with check (aluno_id = auth.uid());

create policy "tentativas_select" on treinamento.tentativas_questionario for select to authenticated using (aluno_id = auth.uid() or treinamento.eh_lideranca());

create policy "acessos_log_select" on treinamento.acessos_log for select to authenticated using (aluno_id = auth.uid() or treinamento.eh_lideranca());
create policy "acessos_log_insert_proprio" on treinamento.acessos_log for insert to authenticated with check (aluno_id = auth.uid());
