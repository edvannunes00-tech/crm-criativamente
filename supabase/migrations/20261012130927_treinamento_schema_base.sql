create schema if not exists treinamento;

create table treinamento.liderancas (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  email text not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table treinamento.alunos (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  email text not null,
  telefone text,
  ativo boolean not null default true,
  criado_por uuid references treinamento.liderancas(id),
  criado_em timestamptz not null default now()
);

create table treinamento.modulos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  descricao text,
  ordem integer not null default 0,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table treinamento.aulas (
  id uuid primary key default gen_random_uuid(),
  modulo_id uuid not null references treinamento.modulos(id) on delete cascade,
  titulo text not null,
  descricao text,
  video_url text not null,
  ordem integer not null default 0,
  percentual_minimo_assistido integer not null default 90 check (percentual_minimo_assistido between 1 and 100),
  exige_questionario boolean not null default false,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table treinamento.questionarios (
  id uuid primary key default gen_random_uuid(),
  aula_id uuid not null references treinamento.aulas(id) on delete cascade,
  titulo text not null default 'Questionário',
  percentual_aprovacao integer not null default 70 check (percentual_aprovacao between 1 and 100),
  criado_em timestamptz not null default now()
);

create table treinamento.perguntas (
  id uuid primary key default gen_random_uuid(),
  questionario_id uuid not null references treinamento.questionarios(id) on delete cascade,
  enunciado text not null,
  ordem integer not null default 0
);

create table treinamento.alternativas (
  id uuid primary key default gen_random_uuid(),
  pergunta_id uuid not null references treinamento.perguntas(id) on delete cascade,
  texto text not null,
  correta boolean not null default false,
  ordem integer not null default 0
);

create table treinamento.acessos_modulo (
  id uuid primary key default gen_random_uuid(),
  aluno_id uuid not null references treinamento.alunos(id) on delete cascade,
  modulo_id uuid not null references treinamento.modulos(id) on delete cascade,
  liberado_por uuid references treinamento.liderancas(id),
  liberado_em timestamptz not null default now(),
  unique (aluno_id, modulo_id)
);

create table treinamento.progresso_aulas (
  id uuid primary key default gen_random_uuid(),
  aluno_id uuid not null references treinamento.alunos(id) on delete cascade,
  aula_id uuid not null references treinamento.aulas(id) on delete cascade,
  percentual_assistido integer not null default 0 check (percentual_assistido between 0 and 100),
  concluida boolean not null default false,
  concluida_em timestamptz,
  atualizado_em timestamptz not null default now(),
  unique (aluno_id, aula_id)
);

create table treinamento.tentativas_questionario (
  id uuid primary key default gen_random_uuid(),
  aluno_id uuid not null references treinamento.alunos(id) on delete cascade,
  questionario_id uuid not null references treinamento.questionarios(id) on delete cascade,
  respostas jsonb not null,
  percentual_acerto integer not null check (percentual_acerto between 0 and 100),
  aprovado boolean not null,
  criado_em timestamptz not null default now()
);

create index on treinamento.aulas (modulo_id, ordem);
create index on treinamento.perguntas (questionario_id, ordem);
create index on treinamento.alternativas (pergunta_id, ordem);
create index on treinamento.progresso_aulas (aluno_id);
create index on treinamento.acessos_modulo (aluno_id);
