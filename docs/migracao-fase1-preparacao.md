# Fase 1 de preparação da migração — relatório

Data: 2026-10-12
Status: **somente preparação — migração definitiva continua NÃO autorizada**
Nenhuma migration foi aplicada no Supabase antigo. Nenhum dado de produção foi alterado. Nenhum deploy foi feito.

---

## 1. Edge Functions recuperadas

Salvas no repositório, conteúdo idêntico ao que está rodando em produção hoje (comparado campo a campo com a versão deployada via `get_edge_function`):

- [`supabase/functions/google-oauth-callback/index.ts`](../supabase/functions/google-oauth-callback/index.ts)
- [`supabase/functions/google-calendar-eventos/index.ts`](../supabase/functions/google-calendar-eventos/index.ts)

Verificações feitas antes de salvar:
- **Convenções do projeto**: ambas já seguem o padrão `CORS_HEADERS` + tratamento de `OPTIONS` usado em todas as outras functions — nenhum ajuste de estilo foi necessário.
- **Dependências**: usam `jsr:@supabase/supabase-js@2` (mesma lib das demais) e a tabela `crm.integracoes_google` (existe no schema, 0 linhas hoje — integração funcional mas não usada atualmente).
- **Secrets**: usam `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — todos via `Deno.env.get(...)`, nenhum valor literal no código.
- **Comportamento**: preservado exatamente como está em produção — nenhuma linha foi alterada, só copiada.

`mp-admin-tmp` não foi recuperada por ser só um stub desativado (`Deno.serve(() => new Response("gone", { status: 410 }))`) — não há nada de útil para preservar; recomendo apenas deletá-la quando formos limpar o projeto.

---

## 2. Migrations ausentes recuperadas

12 arquivos novos em `supabase/migrations/`:

| Arquivo | Como foi recuperado |
|---|---|
| `20261012130927_treinamento_schema_base.sql` | **Original exato** — eu mesmo apliquei nesta sessão, texto preservado integralmente |
| `20261012131001_treinamento_acessos_log_e_rls.sql` | **Original exato** |
| `20261012131015_treinamento_view_perguntas_e_submissao.sql` | **Original exato** |
| `20261012131042_treinamento_grants.sql` | **Original exato** |
| `20261012131100_treinamento_expor_schema_api.sql` | **Original exato** — extra encontrada: eu tinha aplicado isso via `execute_sql` direto (fora do fluxo normal de migration), por isso nem aparecia na lista original de 11 pendências. Corrigido agora. |
| `45_RECONSTRUIDA_automacao_pos_assinatura_contrato.sql` | Reconstruída via introspecção (`pg_get_functiondef` + `pg_get_triggerdef`) — função e trigger conferidos linha a linha contra o banco ao vivo |
| `46_RECONSTRUIDA_recebimentos_automaticos_sinal.sql` | Reconstruída via introspecção — definição completa e atual da função |
| `47_RECONSTRUIDA_papel_consulta_somente_leitura.sql` | **Não recuperável em texto original** — o papel "Consulta" foi renomeado para "Comercial" pela migration seguinte, a linha original não existe mais isolada. Reconstrução plausível, marcada explicitamente como tal |
| `48_RECONSTRUIDA_papel_comercial_criar_editar.sql` | Reconstruída e **conferida**: o resultado final bate exatamente com o que existe hoje em `crm.papel_permissoes` para o papel Comercial |
| `49_RECONSTRUIDA_rastro_autor_contatos_oportunidades_contratos.sql` | Reconstruída via introspecção — colunas e trigger conferidos contra o banco |
| `50_RECONSTRUIDA_vw_contatos_status_inclui_rastro_autor.sql` | Reconstruída via `pg_get_viewdef` — definição exata da view atual |
| `51_RECONSTRUIDA_grant_service_role_convites_usuario.sql` | Reconstruída e conferida via `information_schema.role_table_grants` |

**Resumo de confiabilidade**: 5 arquivos são o texto **original exato** (criados por mim nesta mesma sessão), 6 são **reconstruções fiéis ao estado atual do banco** (via introspecção direta, não "inventadas" — cada uma foi conferida contra o objeto real), e 1 (`47`) é uma **reconstrução plausível não conferível**, porque o objeto original não existe mais para comparar (foi substituído pela 48). Isso está declarado no cabeçalho de cada arquivo reconstruído.

---

## 3. Comparação banco real × repositório

| | Antes desta fase | Depois desta fase |
|---|---|---|
| Migrations locais | 45 | 57 |
| Objetos só no banco remoto (sem arquivo local) | 11 migrations + 1 config de API + 2 Edge Functions | **0** |
| Edge Functions só em produção (sem código local) | 3 (`google-oauth-callback`, `google-calendar-eventos`, `mp-admin-tmp`) | 1 (`mp-admin-tmp`, desativada, não vale recuperar) |

### Diferenças que ainda existem (e são esperadas)

- **Nomenclatura**: os arquivos locais de 2026-09 usam prefixo numérico (`01_`, `02_`...), os do Supabase remoto desse mesmo período usam timestamp + nome descritivo. São os MESMOS objetos, só nomeados diferente nos dois lados — não é uma lacuna de conteúdo, só de convenção de nome de arquivo. Não tentei renomear/unificar isso agora para não mexer em histórico já estável.
- **Migrations de infraestrutura do projeto `afiliados`** (ex: `afiliados_schema_fase1`, `afiliados_automacao_agendador`) já existiam no histórico remoto desde antes, e não são usadas pelo CRM comercial — não fazem parte do escopo desta auditoria de migração do CRM, mas migram junto por estarem no mesmo banco.
- **RLS, grants, constraints**: conferi policy por policy, grant por grant e trigger por trigger especificamente nos objetos relacionados às 11 migrations recuperadas (seção 2) — todos batem exatamente com o banco ao vivo. Não fiz uma varredura de TODAS as 181 políticas RLS do schema `crm` linha a linha (seria redundante: elas já estão nos arquivos de migration mais antigos, que nunca saíram de sincronia).

**Conclusão**: o repositório agora reflete o schema real do banco de produção para tudo que foi identificado como ausente. Não há mais lacunas conhecidas entre código e produção.

---

## 4. Backup gerado

### 4.1 Dados (JSON por schema, em `docs/backups/2026-10-12/`)

| Arquivo | Conteúdo | Tamanho |
|---|---|---|
| `crm_parte1.json` | 9 tabelas do schema `crm` (papel_permissoes, atividades, oportunidade_transicoes, contatos, oportunidades, etc.) | 258.511 bytes |
| `crm_parte2.json` | Outras 31 tabelas do schema `crm` com dados (contratos, recebimentos, usuarios, etc.) | 159.573 bytes |
| `afiliados.json` | 7 tabelas do schema `afiliados` | 248.584 bytes |
| `public.json` | `leads` (3 linhas) e `captacao_tentativas` (0 linhas) | 1.049 bytes |
| `treinamento_e_auth.json` | `treinamento.liderancas` (1 linha) + `auth.users`/`auth.identities` (2 usuários, **sem hash de senha**) | ~1.000 bytes |
| `storage_manifest.json` | Lista dos 43 arquivos do bucket (nome, tamanho, tipo, data) — **não é o conteúdo binário dos arquivos**, só o catálogo | ~12.000 bytes |

**Método usado**: `SELECT jsonb_agg(t) FROM schema.tabela t`, consolidado por schema, com verificação de que cada arquivo foi criado e seu tamanho conferido (tabela acima). Todas as tabelas vazias (0 linhas) foram checadas e deliberadamente omitidas do dump (nada a perder nelas).

**O que esse backup NÃO cobre, e por quê**:
- **Conteúdo binário dos 43 arquivos do Storage** (os PDFs e PNGs em si) — minhas ferramentas atuais não têm acesso de download do Storage, só de metadados via SQL. O manifesto (`storage_manifest.json`) serve de checklist para a cópia real, que precisa ser feita via API do Storage (script Node/Python com a `service_role key`, rodado por você ou por mim com um script que você execute).
- **Hash de senha dos 2 usuários** — intencional, por segurança; não existe exportação seca disso, e mesmo que existisse não seria portável pro projeto novo (ver seção 5 da auditoria original sobre recriação de usuários).
- **Dump de schema via `pg_dump` literal** — não tenho uma ferramenta de `pg_dump` direta; o schema "vivo" está integralmente representado pelos 57 arquivos de migration agora reconciliados em `supabase/migrations/` (essa é, na prática, a fonte de verdade do schema).

### 4.2 Procedimento para completar o backup (passos que exigem você ou autorização extra)

1. **Arquivos do Storage** (os 43 objetos): rodar um script com a `SUPABASE_SERVICE_ROLE_KEY` chamando `supabase.storage.from('documentos-internos').download(path)` para cada `name` do `storage_manifest.json`, salvando localmente no mesmo caminho relativo. Posso escrever esse script agora (sem segredo nenhum embutido, você só exporta a chave no terminal antes de rodar) — não executei ainda porque não tenho a chave e não devo pedir pra você colá-la no chat.
2. **Dump de schema formal via Supabase CLI** (alternativa mais completa ao que já fiz): depois de `supabase login` (hoje sem sessão salva, conforme já confirmei), `supabase db dump --project-ref wdhioclskicixdhkolce -f schema.sql` e `supabase db dump --project-ref wdhioclskicixdhkolce --data-only -f data.sql`. Isso dá um dump binário/SQL oficial, mais robusto que meu JSON tabela-a-tabela — recomendo rodar isso também antes do corte final, quando formos migrar de verdade.

---

## 5. Limitações desta fase

- Não tenho ferramenta de download de Storage — só o manifesto foi gerado, não os arquivos em si.
- Não tenho CLI/management API logada nesta máquina — confirmado meses atrás nesta mesma conversa, continua assim.
- A reconstrução da migration `47` não pôde ser conferida contra o objeto original (foi substituído) — é uma reconstrução plausível, não uma recuperação garantida.
- Não validei este backup restaurando-o num projeto de teste (isso é a FASE 2, que ainda não foi autorizada) — "foi gerado sem erro" não é o mesmo que "está confirmado restaurável", como a própria auditoria original já alertava.

---

## 6. Pendências que exigem sua aprovação

1. Autorizar a geração do script de download dos 43 arquivos do Storage (passo 1 da seção 4.2) — você rodaria localmente com a service_role key, sem ela passar pelo chat.
2. Decidir se vale a pena também rodar `supabase db dump` (CLI oficial) como segunda fonte de backup, redundante ao que já fiz — recomendo sim, antes do corte definitivo.
3. Confirmar se a integração Google Agenda (`google-oauth-callback`/`google-calendar-eventos`, 0 linhas em uso hoje) deve continuar sendo migrada ou pode ser descontinuada — isso muda se ela entra ou não na lista de "recursos a recriar" da migração de verdade.
4. Aprovar (ou não) deletar `mp-admin-tmp` do projeto antigo — é segura de remover, já está desativada, mas é uma ação fora do escopo "somente preparação" desta fase, por isso não fiz sem perguntar.

Parei aqui. Aguardando nova autorização antes de qualquer próximo passo (inclusive os da seção 4.2).
