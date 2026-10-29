# Auditoria para migração do Supabase — Criativamente CRM

Data da auditoria: 2026-10-12
Status: **somente inventário/planejamento — nenhuma ação de migração foi executada**
Executado por: Claudio (agente CRM), a partir do acesso MCP ao projeto Supabase `wdhioclskicixdhkolce` e do repositório local `crm-criativamente`.

> Este relatório não contém senhas, tokens, chaves privadas, CPF, endereços ou conteúdo de contratos. Onde um dado sensível existiria, foi substituído por contagem, nome ou descrição.

---

## 1. Resumo executivo

- O banco é **pequeno** (18 MB) e o Storage é **pequeno** (6,4 MB, 43 arquivos) — isso reduz MUITO o risco e o tempo da migração de dados em si. O gargalo não é volume, é **reconfiguração de integrações externas**.
- Achado crítico: o **repositório local está desatualizado em relação ao banco de produção**. Pelo menos 10 migrations (de `45_automacao_pos_assinatura_contrato` até os 4 arquivos do novo schema `treinamento`) existem só no banco remoto, nunca foram salvas como arquivo `.sql` no repo. Reconstruir o schema a partir dos arquivos locais hoje **não reproduziria o banco atual**.
- Achado crítico: **3 Edge Functions rodando em produção não existem no repositório Git**: `google-oauth-callback`, `google-calendar-eventos` (funcionais, integração Google Agenda) e `mp-admin-tmp` (já desativada, retorna só `410 gone` — pode ser descartada).
- Projeto está no plano **Free** da organização "Criativamente" — sem SLA de suporte, e é essa mesma conta que está com o problema de acesso que motivou esta migração.
- Não tenho acesso a Cloudflare (Pages/Workers) nem ao Mercado Pago via API neste momento — essa parte do inventário (seção 8) é parcial, baseada só no que existe no código local.

---

## 2. Arquitetura atual

- **Banco de dados**: Postgres 17.6 gerenciado pelo Supabase, projeto `wdhioclskicixdhkolce` ("Gravações - Criativamente"), região `us-east-1`, criado em 2026-08-27, organização "Criativamente" (plano **free**).
- **Schemas de aplicação**: `crm` (o CRM em si — clientes, contratos, financeiro), `afiliados` (automação de ofertas/agenda, não ligada ao CRM comercial), `treinamento` (novo, plataforma de treinamento, ainda sem dados reais), `public` (só `leads`/`captacao_tentativas`, usado pela captação do site institucional).
- **Auth**: usa `auth.users` nativo do Supabase, schema `crm` guarda o perfil (`crm.usuarios`) e permissões (`crm.papeis`, `crm.papel_permissoes`).
- **Storage**: 1 bucket privado (`documentos-internos`) — PDFs de contrato, assinaturas capturadas.
- **Edge Functions**: 18 funções ativas (lista completa na seção 6).
- **Frontend/hospedagem**: duas aplicações Cloudflare separadas —
  - `crm-criativamente` (este repo): o CRM interno, HTML+JS puro, sem build, consome Supabase direto do navegador via `src/lib/supabaseClient.js`.
  - `Criativamente` (repo separado, não auditado em profundidade aqui): site institucional + prévias de clientes (Diego), também consome o mesmo projeto Supabase.
- **Worker Cloudflare dedicado**: `workers/email-entrada` (recebimento de e-mail, repassa pro Edge Function `email-entrada`).
- **Pagamentos**: Mercado Pago (Checkout Pro) — sinal avulso e assinatura recorrente (preapproval), webhook central em `mercadopago-webhook`.
- **E-mail**: Resend (API), remetente configurado via secret.

---

## 3. Inventário do banco de dados

### 3.1 Tamanho e contagem geral

| Item | Valor |
|---|---|
| Tamanho total do banco | **18 MB** |
| Políticas RLS (crm/treinamento/afiliados/public) | 181 / 21 / 7 / 1 |
| Funções (crm/treinamento/afiliados) | 85 / 3 / 3 |
| Extensões instaladas de fato | `pgcrypto`, `uuid-ossp`, `pg_stat_statements` (o resto da lista longa do Supabase está só *disponível*, não instalada) |
| `pg_cron` | não instalado — **não há jobs agendados no banco** |
| `vault.secrets` | 0 linhas — nenhum segredo vive no Vault; tudo está nos secrets das Edge Functions |

### 3.2 Tabelas com dados (schema `crm`, as que importam para o negócio)

| Tabela | Linhas | Observação |
|---|---|---|
| `papel_permissoes` | 196 | matriz de permissões por papel — recriável via seed |
| `atividades` | 99 | histórico/timeline |
| `oportunidade_transicoes` | 41 | histórico de pipeline |
| `contatos` | 35 | leads + clientes |
| `oportunidades` | 33 | |
| `contrato_itens` | 11 | |
| `produtos_servicos` | 11 | catálogo |
| `contrato_links` | 8 | links públicos de contrato (tokens — ver seção 3.4) |
| `emails` | 8 | |
| `contratos` | 6 | |
| `recebimentos` | 3 | financeiro |
| `assinaturas_recorrentes` | 3 | recorrência Mercado Pago |
| `usuarios` | 2 | você + Roberta (convidada, ainda não logou) |
| `contrato_dados_cliente` | 2 | dados preenchidos pelos clientes nos contratos |
| `empresas` | 1 | single-tenant na prática (uma empresa só) |
| `convites_usuario` | 1 | |
| demais ~30 tabelas | 0 | estrutura existe, sem dados ainda (tarefas, despesas, importações, etc.) |

Schema `afiliados`: 7 tabelas com dados (`agenda` 225 linhas é a maior), não tem relação com o CRM comercial — é a automação separada.
Schema `treinamento`: só a sua própria liderança cadastrada (1 linha), resto vazio — plataforma nova, nada a perder aqui.
Schema `public`: `leads` com 3 linhas (captação do site institucional).

### 3.3 O que é do Supabase vs. o que é nosso

- `auth.*`, `storage.*`, `extensions.*`, `vault.*`, `pgsodium.*`, `graphql.*` → **gerenciados pelo Supabase**, recriados automaticamente ao criar um projeto novo (vazios). Só precisamos repovoar `auth.users`/`auth.identities` (nossos 2 usuários) e `storage.objects` (os 43 arquivos).
- `crm`, `afiliados`, `treinamento`, `public.leads`/`public.captacao_tentativas` → **nossos**, precisam ser recriados via schema + dados.

### 3.4 Atenção especial: `contrato_links` e tokens

Os links públicos de contrato guardam `token_hash` (SHA-256 do token), não o token em si — **não é um segredo que "vaza" num dump**, mas um link já enviado a um cliente que seja migrado continuará funcionando normalmente no projeto novo (mesmo token, mesmo hash, mesma lógica), desde que a tabela e a função de validação sejam migradas juntas. Não precisa regenerar links que já estão ativos.

---

## 4. Inventário do Storage

| Bucket | Público | Objetos | Tamanho |
|---|---|---|---|
| `documentos-internos` | Não (privado) | 43 | 6,4 MB |

Conteúdo típico (pelo padrão de nomes usado no código): PDFs de contrato, assinaturas capturadas (PNG) do cliente e da contratada, organizados em pastas por `empresa_id/contratos/<contrato_id>/...`.

**Importante**: dump de banco **não copia arquivos**. O Storage precisa ser copiado à parte (download de cada objeto do projeto antigo + upload no novo, preservando o mesmo caminho/nome — os campos `*_path` nas tabelas do CRM apontam para esses caminhos exatos). Com 6,4 MB isso é trivial e rápido.

Não há URLs assinadas de longa duração guardadas em tabelas (as funções geram signed URLs sob demanda, no momento do acesso) — então não há "links quebrados por mudança de projeto" a prever aqui, só a necessidade de as Edge Functions apontarem para o Storage do projeto novo depois do corte.

---

## 5. Inventário de autenticação

- **2 usuários** em `auth.users`, ambos via provider `email` (login/senha — **não** é "Sign in with Apple"; isso só afetava o seu acesso ao *dashboard* do Supabase, não os usuários do CRM):
  - `edvannunes00@gmail.com` — confirmado, já logou.
  - `roberta@criativamentedigital.com.br` — convidada, **nunca logou** (ainda bloqueada pelo problema de e-mail do plano free, já diagnosticado antes).
- Nenhum provider OAuth configurado para o CRM em si (o OAuth existente é só a integração pessoal com Google Agenda, separada — ver seção 6).
- `crm.usuarios` espelha `auth.users` 1:1 (mesmo `id`), guarda nome/avatar.

**O que não migra automaticamente**: Supabase não exporta senha em texto puro (nem deveria). Ao migrar, o caminho seguro e padrão é recriar os usuários no projeto novo via `inviteUserByEmail` (como já fazemos hoje) ou um reset de senha — ou seja, **tanto você quanto a Roberta (quando ela conseguir entrar) provavelmente vão precisar definir uma senha nova** no projeto novo. Isso é esperado e não é um bug da migração.

---

## 6. Inventário das Edge Functions

18 funções ativas. `verify_jwt` = exige login no CRM; sem isso, a função faz sua própria checagem (necessário para rotas públicas, ex. contrato público).

| Função | Pra quê serve | Auth | No Git? |
|---|---|---|---|
| `contrato-gerar-link` | Gera link público do contrato | exige login | sim |
| `contrato-publico` | Serve o conteúdo do contrato pro link público (GET/POST) | pública | sim |
| `contrato-revogar-link` | Revoga um link ativo | exige login | sim |
| `contrato-segunda-via` | Fluxo de segunda via do contrato | pública | sim |
| `contrato-abrir-link` | Reabre link pro CRM (descriptografa token salvo) | exige login | sim |
| `contrato-assinar-contratada` | Assinatura da Criativamente no contrato | exige login | sim |
| `contrato-enviar-copia` | Envia cópia do contrato assinado por e-mail | pública (chamada pelo fluxo público) | sim |
| `contrato-pagamento-sinal` | Checkout Pro do sinal (Mercado Pago) | pública | sim |
| `recorrencia-checkout` | Assinatura recorrente (preapproval Mercado Pago) | pública | sim |
| `recorrencia-cancelar` | Cancela assinatura recorrente | exige login | sim |
| `mercadopago-webhook` | Recebe notificações do Mercado Pago | pública (webhook) | sim |
| `convidar-usuario` | Convida usuário novo pro CRM | exige login | sim |
| `email-enviar` | Envio de e-mail (Resend) | exige login | sim |
| `email-entrada` | Recebe e-mail encaminhado (via Worker Cloudflare) | pública + secret próprio | sim |
| `email-anexo` | Serve anexo de e-mail | exige login | sim |
| `google-oauth-callback` | Conecta Google Agenda (OAuth) | pública (checa token manualmente) | **NÃO — só existe em produção** |
| `google-calendar-eventos` | Lista eventos do Google Agenda conectado | pública (checa token manualmente) | **NÃO — só existe em produção** |
| `mp-admin-tmp` | Desativada (`410 gone`) | exige login | não é preciso — pode ser apagada |

**Ação recomendada antes da migração**: salvar o código de `google-oauth-callback` e `google-calendar-eventos` no repositório (já tenho o conteúdo das duas, só falta você aprovar que eu as commite) — hoje elas só existem "na nuvem", se o projeto sumir, esse código some com ele.

---

## 7. Inventário de secrets (só nomes, nunca valores)

Variáveis usadas pelo código das Edge Functions (`Deno.env.get(...)`):

| Variável | Usada por | Precisa rotacionar na migração? |
|---|---|---|
| `SUPABASE_URL` | quase todas | Sim — muda pro projeto novo (gerada automaticamente pelo próprio Supabase) |
| `SUPABASE_ANON_KEY` | quase todas | Sim — nova, gerada automaticamente |
| `SUPABASE_SERVICE_ROLE_KEY` | quase todas | Sim — nova, gerada automaticamente |
| `MERCADO_PAGO_ACCESS_TOKEN` | pagamentos | Não precisa trocar (mesma conta Mercado Pago) — só recadastrar o mesmo valor no projeto novo |
| `MERCADO_PAGO_WEBHOOK_SECRET` | webhook | Mesma lógica acima |
| `MERCADO_PAGO_DEBUG` | pagamentos (opcional) | Não é segredo, é flag |
| `RESEND_API_KEY` | e-mail | Recadastrar o mesmo valor |
| `RESEND_FROM_EMAIL` | e-mail | Não é segredo |
| `EMAIL_CONTATO` | e-mail | Não é segredo |
| `ADMIN_NOTIFICATION_EMAIL` | notificações | Não é segredo |
| `EMAIL_ENTRADA_SECRET` | Worker → Edge Function | Recadastrar o mesmo valor nos dois lados (Cloudflare + Supabase) |
| `LINK_TOKEN_KEY` | criptografia do token de link (AES-GCM) | **Decisão necessária** — ver abaixo |
| `SITE_URL` | redirecionamentos | Atualiza se o domínio mudar (não deveria mudar) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | integração Google Agenda (achadas no código das funções que não estão no Git) | Mesmo client OAuth do Google, só recadastrar |

**Decisão que só você pode tomar sobre `LINK_TOKEN_KEY`**: essa chave cifra o token dos links de contrato pra o CRM conseguir "reabrir"/reexibir o link já gerado. Se você usar uma chave **diferente** no projeto novo, qualquer link cifrado com a chave antiga deixa de poder ser reaberto pela função `contrato-abrir-link` (o link em si continua funcionando pro cliente, só a conveniência de "ver de novo no CRM" quebra para os links antigos). O mais seguro é **copiar o mesmo valor** pro projeto novo.

Nenhum valor real foi exposto nesta auditoria — os scripts `scripts/mercadopago-secrets.sh` e `scripts/email-secrets.sh` já seguem a prática correta (pedem o valor no terminal, nunca gravam em arquivo).

---

## 8. Cloudflare, GitHub e frontend

**Limitação desta auditoria**: não tenho uma ferramenta de API da Cloudflare conectada nesta sessão — o que segue é só o que dá pra ver pelo código local. As configurações reais de build/domínio/variáveis de ambiente no **painel** da Cloudflare (Pages) precisam ser conferidas por você diretamente.

- Dois projetos de frontend, dois repositórios:
  - `crm-criativamente` (este) → provavelmente um Cloudflare Pages apontando pra esse repo.
  - `Criativamente` (repo irmão, `~/Developer/Criativamente`) → site institucional + prévias de clientes, também consome o mesmo Supabase (achei o project ref em `src/sites.js`, `src/config.js`, `_headers`).
- Worker dedicado: `workers/email-entrada/wrangler.toml` — tem `FUNCTION_URL` apontando pra URL completa do Edge Function (`https://wdhioclskicixdhkolce.supabase.co/functions/v1/email-entrada`) e `FORWARD_TO` (seu e-mail). O secret `EMAIL_ENTRADA_SECRET` fica configurado via `wrangler secret put`, fora do repo.
- `git status` do repo do CRM: limpo, sem pendência de commit relevante (só uma pasta `IMG_3478/` e um `.DS_Store` soltos, sem relação com código).

### Referências ao projeto Supabase antigo encontradas no código

| Arquivo | O quê |
|---|---|
| `src/lib/supabaseClient.js` (`crm-criativamente`) | URL + publishable key do CRM |
| `workers/email-entrada/wrangler.toml` | URL completa do Edge Function `email-entrada` |
| `scripts/mercadopago-secrets.sh`, `scripts/email-secrets.sh` | `project-ref` usado nos comandos `supabase secrets set` |
| `src/sites.js`, `src/config.js`, `_headers` (repo `Criativamente`) | URL/config do Supabase usada pelas prévias de clientes |

Não basta trocar a `SUPABASE_URL` num lugar só — **são pelo menos 2 repositórios e 1 worker** que precisam ser atualizados juntos no dia do corte.

---

## 9. Estado do GitHub e migrations — ACHADO CRÍTICO

Comparei `supabase/migrations/` local (45 arquivos) com `list_migrations` do projeto remoto (105 migrations aplicadas). As que existem **só no banco remoto**, sem arquivo local correspondente:

```
45_automacao_pos_assinatura_contrato
46_recebimentos_automaticos_sinal
47_papel_consulta_somente_leitura
48_papel_comercial_criar_editar
49_rastro_autor_contatos_oportunidades_contratos
50_vw_contatos_status_inclui_rastro_autor
51_grant_service_role_convites_usuario
treinamento_schema_base
treinamento_acessos_log_e_rls
treinamento_view_perguntas_e_submissao
treinamento_grants
```

Isso aconteceu porque, nas últimas sessões, migrations foram aplicadas direto no banco (via ferramenta de administração) sem o passo extra de salvar o arquivo `.sql` no repositório.

**Consequência prática**: se reconstruirmos o schema do zero só "rodando os arquivos locais em ordem", o banco novo ficaria **sem** status automático pós-assinatura, sem o lançamento automático de recebimentos, sem os papéis "Consulta" e "Comercial", sem o rastro de autor, sem a view atualizada, sem o grant do convite de usuário, e sem o schema `treinamento` inteiro.

**Caminho seguro recomendado**: não confiar na "replay de migrations" para a reconstrução. Usar `pg_dump --schema-only` do banco **atual** (que reflete 100% a realidade) como base da reconstrução, e só depois reconciliar esse dump com o histórico de migrations do Git (gerando os arquivos que faltam, para não perder isso de novo). Posso gerar esses 11 arquivos de migration que faltam a partir do que foi efetivamente aplicado, se você quiser — isso resolve a lacuna independente da migração de conta.

Além disso: `afiliados_*` e `expor_schema_crm_para_api` são migrations de infraestrutura/API (exposição de schema, automação do módulo de afiliados) que também precisam rodar na ordem certa.

---

## 10. Dependências do projeto antigo (resumo)

| Dependência | Onde |
|---|---|
| `SUPABASE_URL` + `SUPABASE_PUBLISHABLE_KEY` | `crm-criativamente/src/lib/supabaseClient.js` |
| `SUPABASE_URL` + chave pública | repo `Criativamente` (3 arquivos) |
| `FUNCTION_URL` do Edge Function `email-entrada` | `workers/email-entrada/wrangler.toml` (Cloudflare) |
| `project-ref` nos scripts de secrets | `scripts/*.sh` (uso local, não produção) |
| Webhook do Mercado Pago | configurado no painel do Mercado Pago, apontando pra `.../functions/v1/mercadopago-webhook` do projeto atual — **não verificado nesta auditoria** (preciso que você confirme no painel do Mercado Pago) |
| OAuth do Google (redirect URI) | configurado no Google Cloud Console, provavelmente aponta pro domínio do CRM, não direto pro Supabase — **não verificado** |

---

## 11. Recursos que precisam ser recriados manualmente no projeto novo

- Projeto Supabase novo (região, de preferência a mesma `us-east-1` pra manter latência).
- Extensões: só `pgcrypto`, `uuid-ossp` precisam ser instaladas explicitamente (as outras da lista longa são só "disponíveis por padrão" no Supabase, não usadas por nós).
- Bucket de Storage `documentos-internos` (privado).
- As 18 Edge Functions (incluindo as 2 que só existem em produção hoje).
- Os 13+2 secrets listados na seção 7 (valores recadastrados, exceto os 3 que o Supabase gera sozinho).
- Exposição do schema `crm`/`afiliados`/`treinamento` na API (hoje isso é feito via `ALTER ROLE authenticator SET pgrst.db_schemas = ...`, não é automático).
- Configuração de convite/e-mail de autenticação (o problema de e-mail do plano free que já diagnosticamos antes — vale configurar SMTP customizado via Resend **desde já** no projeto novo, já que vamos ter que mexer nisso mesmo).
- No painel do Mercado Pago: atualizar a URL do webhook pro novo domínio do Supabase.
- No Google Cloud Console (se a integração de Agenda for mantida): conferir/atualizar redirect URI se depender da URL do Supabase (pelo código, não depende — o redirect é pro domínio do CRM).
- No Cloudflare: variáveis de ambiente/build dos dois projetos de frontend + o secret do Worker `email-entrada`.

---

## 12. Dados e arquivos que precisam ser copiados

- Todo o conteúdo de `crm`, `afiliados`, `treinamento`, `public.leads`/`public.captacao_tentativas` (18 MB).
- `auth.users` + `auth.identities` dos 2 usuários (recriados via convite/reset, não copiados literalmente).
- Os 43 objetos do bucket `documentos-internos` (6,4 MB), preservando os caminhos exatos.

---

## 13. Estratégia de backup

- **Schema**: `pg_dump --schema-only` (via `apply_migration`/conexão direta) cobre tabelas, views, funções, triggers, RLS, grants, constraints, sequences — tudo que é "nosso" nos schemas `crm`/`afiliados`/`treinamento`/`public`.
- **Dados**: `pg_dump --data-only` por schema, ou exportação tabela a tabela em JSON (mais fácil de auditar/validar linha por linha, dado o volume pequeno).
- **Storage**: download de cada um dos 43 objetos (script simples, via API do Supabase Storage), preservando caminho.
- **Edge Functions**: já tenho o código de 16 das 18 via Git; as 2 que faltam (`google-oauth-callback`, `google-calendar-eventos`) eu baixo direto da API do Supabase.
- **Secrets**: não dá pra exportar valor (API não permite ler, só listar nomes) — a lista de nomes está pronta (seção 7), os valores precisam ser redigitados por você no projeto novo (mesmo fluxo dos scripts que já existem).
- **Validação do backup**: a forma correta não é "rodou sem erro", é restaurar num projeto de teste e comparar contagem de linhas por tabela + rodar os fluxos críticos (login, gerar link de contrato, abrir link público, pagar sinal em sandbox) antes de considerar o backup confiável.

---

## 14. Plano de migração proposto

1. Aprovar este relatório e decidir: criar o projeto novo numa conta Supabase que você controle de fato (recomendado, dado o histórico de acesso).
2. Gerar os 11 arquivos de migration que faltam no Git (seção 9), pra nunca mais depender só do banco remoto como fonte de verdade.
3. Rodar `pg_dump --schema-only` do projeto atual e revisar contra as migrations reconciliadas.
4. Criar o projeto novo, instalar extensões necessárias, aplicar o schema.
5. Expor os schemas `crm`/`afiliados`/`treinamento` na API.
6. Copiar os dados (JSON por tabela ou `pg_dump --data-only`), na ordem que respeita as foreign keys.
7. Copiar os 43 arquivos do Storage.
8. Recriar as 18 Edge Functions no projeto novo.
9. Configurar os secrets (seção 7).
10. Criar os 2 usuários (você, Roberta) — convite/reset de senha.
11. Testar em paralelo, **sem trocar o frontend ainda**: apontar um ambiente de teste (ex. uma branch/preview do Cloudflare Pages) pro projeto novo e rodar a matriz de testes (seção 15).
12. Configurar SMTP customizado (Resend) no projeto novo, já resolvendo o problema de convite de usuário de uma vez.
13. Atualizar webhook do Mercado Pago pro domínio novo.
14. Só depois de validar tudo: trocar `SUPABASE_URL`/chaves nos dois repositórios de frontend + no Worker, e fazer o deploy real.
15. Manter o projeto antigo **intacto e acessível** (sem apagar nada) por um período de validação — mesmo que você nunca recupere o acesso ao dashboard dele, a conexão MCP atual continua funcionando como fonte de consulta até decidirmos abandoná-lo de vez.

## 15. Matriz de testes (resumo — detalhar antes de executar)

- **Banco**: contagem de linhas por tabela (origem x destino), 0 órfãos em FKs, sequences não duplicando IDs.
- **Auth**: login funciona, permissões batem (um usuário "Consulta" não edita, um "Comercial" não exclui).
- **CRM**: abrir um contato, uma oportunidade, um contrato existente — dados batendo com o que existia antes.
- **Contratos públicos**: um link antigo ainda abre e mostra o conteúdo certo; gerar um link novo funciona; PDF final gera certo.
- **Storage**: baixar um PDF/assinatura já existente depois da cópia, comparando tamanho/hash com o original.
- **Mercado Pago**: um pagamento de teste (sandbox) completa o fluxo e o webhook atualiza o status certo.
- **Segurança**: um usuário não vê dados de permissão que não tem; schema `crm` não aparece pra `anon` fora do que é RLS-liberado.

## 16. Plano de rollback

- Critério de parada: qualquer teste da seção 15 falhar de forma não explicada, ou contagem de linhas não bater.
- Enquanto o DNS/config de produção não for trocado (passo 14 do plano), **o ambiente antigo continua sendo o de produção real** — reverter é simplesmente não fazer o passo 14.
- Depois do corte, reverter significa trocar `SUPABASE_URL`/chaves de volta pro projeto antigo nos dois frontends + worker — por isso a recomendação de só cortar depois de validar tudo em ambiente de teste primeiro.

---

## 17. Riscos

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Schema reconstruído incompleto (migrations faltando) | Alta, se não corrigirmos a seção 9 antes | Alto | Gerar as 11 migrations faltantes + usar `pg_dump --schema-only` como verdade, não só replay |
| Edge Function "invisível" esquecida (as 2 fora do Git) | Média | Médio | Já identificadas nesta auditoria, código já recuperado |
| Webhook do Mercado Pago apontando pro projeto antigo após o corte | Média | Alto (pagamento não registrado) | Atualizar o webhook **antes** de liberar produção no projeto novo, testar em sandbox primeiro |
| Usuários não conseguem logar após migração | Alta (esperado) | Baixo (resolvido com reset de senha) | Avisar você e a Roberta com antecedência |
| `LINK_TOKEN_KEY` diferente quebra "reabrir link" de contratos antigos | Baixa (se copiarmos o valor) | Baixo | Copiar o mesmo valor pro projeto novo |
| Downtime na janela de corte | Baixa, se bem planejado | Médio | Fazer a troca em horário de baixo uso, com os dois ambientes testados antes |
| Repositório `Criativamente` (sites) ficar esquecido na troca | Média (é fácil lembrar só do CRM) | Alto (prévias de clientes param de funcionar) | Incluído explicitamente nesta auditoria e no plano |

---

## 18. Custos e autonomia

Não tenho dados de uso (egress, invocações de função, armazenamento ao longo do tempo) desta auditoria — o projeto é pequeno e novo (criado em 27/08), então é improvável que esteja perto de qualquer limite do plano free, mas não posso confirmar números de consumo sem acesso ao painel de billing (que é exatamente o acesso que falta).

Dado o tamanho atual (18 MB banco, 6,4 MB storage, baixo tráfego), **o plano Free do projeto novo deve ser suficiente no início** — não há necessidade de recomendar upgrade agora. Recomendo, sim, que o projeto novo seja criado numa conta/organização onde você tenha certeza de ser o dono (evita repetir esse problema).

---

## 19. Pendências que exigem sua decisão

1. Confirmar: projeto novo numa conta Supabase que você cria agora e controla? (Recomendado.)
2. Aprovar eu gerar os 11 arquivos de migration que faltam no Git (resolve a lacuna da seção 9 **independente** de quando migrarmos).
3. Aprovar eu commitar `google-oauth-callback` e `google-calendar-eventos` no repositório (código já recuperado, só falta salvar).
4. Confirmar se a integração com Google Agenda ainda é usada/necessária (hoje `integracoes_google` está com 0 linhas — pode já estar obsoleta).
5. Decidir se mantemos `LINK_TOKEN_KEY` idêntico no projeto novo (recomendado) ou aceitar que links antigos percam a função "reabrir no CRM".
6. Confirmar acesso ao painel do Mercado Pago pra eu poder orientar a troca do webhook no momento certo.
7. Decidir a janela de corte (dia/horário de baixo movimento).

## 20. Critérios de conclusão

A migração é considerada concluída quando:

- Contagem de linhas por tabela bate entre origem e destino.
- Os 43 arquivos do Storage existem no projeto novo com o mesmo caminho e mesmo tamanho.
- As 18 Edge Functions estão deployadas e respondendo no projeto novo.
- Login funciona para você e para a Roberta no projeto novo.
- Um contrato de teste completo (criar → gerar link → preencher → assinar → pagar sinal em sandbox) funciona do início ao fim.
- Webhook do Mercado Pago e SMTP de convite estão configurados e validados no projeto novo.
- Os dois repositórios de frontend (`crm-criativamente` e `Criativamente`) e o Worker `email-entrada` apontam pro projeto novo em produção.
- O projeto antigo continua preservado (não apagado), disponível como histórico/fallback.
