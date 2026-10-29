# Fase 2 — scripts e procedimentos de backup (preparação)

Data: 2026-10-12
Status: **somente preparação — nada foi executado ainda**. Migração definitiva continua NÃO autorizada. Nenhum dado de produção foi alterado, nenhuma migration aplicada, nenhum deploy feito, nada excluído na origem.

---

## 1. Script de download do Storage

Arquivo: [`scripts/storage-backup-download.mjs`](../scripts/storage-backup-download.mjs)

### O que ele faz
- Lê `docs/backups/2026-10-12/storage_manifest.json` (os 43 objetos já catalogados na Fase 1).
- Baixa cada objeto via API REST do Storage, usando a `service_role key` só para autenticar a leitura (não precisa e não torna o bucket público).
- Recria a mesma estrutura de pastas/nomes em `docs/backups/2026-10-12/storage/`.
- Calcula SHA-256 e tamanho de cada arquivo baixado.
- Compara o tamanho baixado com o tamanho do manifesto original — **para imediatamente** (sem continuar pros próximos arquivos) se algum arquivo vier com tamanho diferente do esperado ou falhar o download.
- Ao final (só se tudo bater), grava `docs/backups/2026-10-12/storage_manifest_baixado.json` com nome, tamanho, SHA-256 e data/hora do download de cada arquivo.
- Só faz `GET` — nenhuma chamada de escrita/exclusão é feita contra o Storage de origem.

### Como rodar
Sem instalar nada (usa só o Node nativo, versão 18+; você tem a v24, então está ok):

```bash
export SUPABASE_URL="https://wdhioclskicixdhkolce.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="cole a chave aqui, só no seu terminal"
node scripts/storage-backup-download.mjs
```

A chave fica só na sua sessão de terminal (variável de ambiente), nunca é passada pra mim nem gravada em arquivo nenhum pelo script.

### Pré-requisitos
- Node 18+ já instalado (confirmado: v24.20.0 nesta máquina).
- A `SUPABASE_SERVICE_ROLE_KEY` do projeto atual — você já tem isso configurado hoje nos secrets das Edge Functions; dá pra conferir o valor no painel do Supabase (Project Settings → API) **se você tiver acesso**, ou recuperar de algum lugar onde você já tenha salvo antes (ex: gerenciador de senhas, onde rodou os scripts de `scripts/mercadopago-secrets.sh` da primeira vez).

### Riscos
- Baixo: é só leitura. Pior cenário é o script falhar no meio (ele já para e avisa exatamente onde) e você rodar de novo.
- Se a `service_role key` não estiver mais acessível a você (mesmo problema de acesso geral), este passo fica bloqueado — nesse caso, preciso confirmar se **minha** conexão atual ainda consegue gerar signed URLs de leitura via SQL como alternativa (não testei ainda, é plano B).

---

## 2. Backup oficial via Supabase CLI — procedimento (ainda não executado)

Consultei a documentação oficial antes de escrever isto (`search_docs`). O comando recomendado atualmente pelo Supabase é:

```bash
supabase db dump --db-url [CONNECTION_STRING] -f roles.sql --role-only
supabase db dump --db-url [CONNECTION_STRING] -f schema.sql
supabase db dump --db-url [CONNECTION_STRING] -f data.sql --use-copy --data-only -x "storage.buckets_vectors" -x "storage.vector_indexes"
```

### Limitação de acesso encontrada (importante)

Esse comando precisa de **uma de duas coisas**, e eu verifiquei as duas nesta máquina:

1. **`--db-url` com a connection string completa** (inclui host, porta, usuário e **senha do Postgres** do projeto) — essa senha normalmente só é visível no painel do Supabase (Project Settings → Database), que é exatamente o acesso que falta. Ela também pode ter sido salva em algum lugar seu no momento da criação do projeto (27/08) — vale você checar um gerenciador de senhas ou anotações.
2. **`supabase login` + `--project-ref`** (sem precisar da senha do banco, usa sessão OAuth do CLI) — testei agora: **não há sessão salva nesta máquina** (`npx supabase projects list` retorna `AccessTokenRequiredError`). Login abriria o navegador pedindo pra autenticar numa conta Supabase — e like o problema original é justamente não conseguir entrar em nenhuma conta Supabase, esse caminho provavelmente está igualmente bloqueado, a não ser que o login funcione de um jeito diferente do dashboard (não teria como eu confirmar sem você tentar).

**Ou seja**: este backup "oficial" via CLI depende de um dos dois acessos que estamos tentando recuperar. Não é algo que eu travei por precaução — é uma limitação real de acesso.

### O que já temos como alternativa funcional
- **Schema**: os 57 arquivos de `supabase/migrations/` (reconciliados na Fase 1) já representam o schema completo.
- **Dados**: os 6 arquivos JSON em `docs/backups/2026-10-12/` (Fase 1) já cobrem todas as tabelas com conteúdo.
- **Roles/grants**: cobertos dentro das próprias migrations (os `GRANT` estão nos arquivos `.sql`).

Ou seja: mesmo sem conseguir rodar o `supabase db dump` oficial agora, **já temos um backup funcional e completo** pelos dois métodos que eu consegui executar diretamente. O dump oficial seria uma segunda fonte redundante (mais robusta num ponto: preserva tipos de dado binários exatos, encoding, etc., coisa que o JSON às vezes arredonda) — recomendável antes do corte final de produção, mas não bloqueia o backup de hoje.

### Se você conseguir a connection string (senha do Postgres) de algum lugar

Me avisa que eu preparo o comando exato pra você rodar (você digita a senha só no seu terminal, nunca no chat) — registro aqui o procedimento pra quando isso acontecer:

```bash
# 1. Confirmar versão da CLI usada (fica registrado no relatório)
npx supabase --version

# 2. Dump de roles (sem dados)
npx supabase db dump --db-url "$DB_URL" -f docs/backups/2026-10-12/roles.sql --role-only

# 3. Dump de schema (estrutura completa)
npx supabase db dump --db-url "$DB_URL" -f docs/backups/2026-10-12/schema.sql

# 4. Dump de dados (usa COPY, mais rápido e fiel que INSERT linha a linha)
npx supabase db dump --db-url "$DB_URL" -f docs/backups/2026-10-12/data.sql --use-copy --data-only \
  -x "storage.buckets_vectors" -x "storage.vector_indexes"

# 5. Registrar hash de cada arquivo gerado (verificação de integridade)
shasum -a 256 docs/backups/2026-10-12/roles.sql docs/backups/2026-10-12/schema.sql docs/backups/2026-10-12/data.sql
```

Nenhum desses comandos expõe a senha em log — ela só aparece na variável `$DB_URL` da sua própria sessão de terminal, nunca impressa.

---

## 3. Google Agenda — mantido como componente opcional

`google-oauth-callback` e `google-calendar-eventos` continuam no repositório (recuperados na Fase 1). Registrando aqui, para o inventário da migração: **não serão configurados nem implantados no projeto novo** até vocês decidirem se a integração continua em uso (hoje: 0 linhas em `crm.integracoes_google`, ou seja, ninguém está conectado ao Google Agenda no momento).

## 4. `mp-admin-tmp` — mantida intocada

Nenhuma alteração feita na função no projeto antigo. Continua desativada (`410 gone`), sem nenhuma ação necessária agora.

---

## 5. Resumo de validação desta fase

| Item | Status |
|---|---|
| Script de download do Storage | Criado, **não executado** (precisa da service_role key no seu terminal) |
| Backup oficial via Supabase CLI | **Bloqueado** por falta de acesso (connection string ou login) — documentado, pronto pra rodar assim que destravar |
| Google Agenda | Código preservado, marcado como opcional, nada implantado |
| `mp-admin-tmp` | Intocada |
| Alterações em produção | Nenhuma |

## 6. Pendências que exigem sua ação

1. Rodar `node scripts/storage-backup-download.mjs` com a service_role key, quando puder.
2. Verificar se você tem a senha do Postgres do projeto (connection string) salva em algum lugar — isso destrava o backup oficial via CLI. Se não tiver, esse passo fica esperando a recuperação de acesso (dashboard ou CLI login).
3. Me avisar o resultado do passo 1 (quantos dos 43 arquivos bateram) pra eu atualizar o relatório consolidado.

Parando aqui, aguardando sua aprovação pra continuar.
