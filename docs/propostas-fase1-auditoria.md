# Propostas Comerciais — Fase 1: Auditoria e Plano

Data: 2026-10-15
Status: **somente auditoria e planejamento — nada foi criado, alterado ou implantado em produção**

---

## 1. O que já existe e pode ser reaproveitado

### 1.1 Um esqueleto de `crm.propostas` já existe — e está obsoleto demais pra reaproveitar como está

Achado importante: já existe uma tabela `crm.propostas` no banco (0 linhas, nunca usada de verdade), criada bem no início do projeto, com um trigger (`trg_proposta_evento`) que já loga `proposta_criada`/`enviada`/`aceita`/`recusada` na timeline (`crm.atividades`). Estrutura atual:

```
id, empresa_id, contato_id, oportunidade_id, produto_id (um só!),
descricao, valor, condicoes (texto livre), validade_at, status, created_at, updated_at
```

Isso é um rascunho de "proposta de item único com texto livre" — não suporta múltiplos itens, não tem snapshot, não tem versionamento, não tem link público/token, não tem PDF. É muito mais simples do que o que você pediu.

**Também já existe**: o módulo `propostas` já está cadastrado em `crm.modulos` (chave `propostas`, ordem 6 — logo depois de Oportunidades) — ou seja, o sistema de permissões já estava preparado pra essa tela existir, só nunca foi construída.

**Recomendação**: não dá pra só "completar" a tabela antiga com ALTER TABLE — a diferença estrutural é grande demais (item único → multi-item com snapshot). Como está com 0 linhas, o mais limpo é **recriar do zero** nesse mesmo nome (`crm.propostas`) + novas tabelas satélite, preservando o trigger de eventos (adaptado) e o módulo de permissão já existente.

### 1.2 O padrão de contratos é a referência mais próxima — e dá pra reaproveitar MUITO dele

O módulo de contratos já resolve, praticamente ponto a ponto, metade do que a proposta precisa:

| O que você pediu | Onde já existe em `contratos` | Reaproveitável como está? |
|---|---|---|
| Multi-item com snapshot de escopo | `crm.contrato_itens` + trigger `trg_before_contrato_item` (copia `escopo_*`, `termos_contratuais`, preços de `crm.produtos_servicos` no momento da inserção) | **Sim, o padrão inteiro** — é exatamente o mecanismo de snapshot que você descreveu na seção 6 |
| Preço de tabela vs. negociado vs. desconto | `valor_tabela_unitario` / `valor_negociado_unitario` / `desconto_unitario` / `valor_total` (calculado por trigger) | **Sim** |
| Bônus | `crm.contrato_bonus` | **Sim** |
| Condições de pagamento estruturadas | `condicao_pagamento_tipo`, `condicao_pagamento_percentual_entrada`, `forma_pagamento`, `parcelas_*` (colunas em `contratos`, com `CHECK` de valores válidos) | **Sim** |
| Link público com token seguro | `crm.contrato_links` — token aleatório, só o hash (`token_hash`) é salvo, `expires_at`, `status` (ativo/revogado/expirado/confirmado), Edge Function `contrato-gerar-link` gera e nunca reexpõe o token cru depois | **Sim, o padrão — mas precisa de uma tabela própria `proposta_links`, não reaproveitar a mesma tabela** (você pediu isso explicitamente na seção 12, e faz sentido: escopos de acesso diferentes) |
| Página pública sem login | Edge Function `contrato-publico` (`verify_jwt: false`, resolve tudo a partir do hash do token, nunca devolve dado de outro contrato) | **Sim, o padrão — precisa de uma function própria `proposta-publica`** |
| PDF gerado a partir do mesmo conteúdo da página | `jsPDF` **no navegador**, dentro de `contrato-publico.html`/`ficha-contrato.html` — monta o PDF em JS a partir dos mesmos dados que a página renderiza, nunca um conteúdo gerado separadamente | **Sim, o mesmo padrão resolve exatamente o requisito da seção 3B** ("não quero que a página mostre um escopo e o PDF outro") |
| Versionamento sem alterar silenciosamente o que já foi enviado | `crm.contratos_versoes` (`versao`, `documento_id` apontando pro PDF gerado daquela versão, `motivo_substituicao`) | **Sim, o padrão** |
| Armazenamento do PDF gerado | `crm.documentos` (tabela genérica: `entidade_tipo` + `entidade_id` + `storage_path`) já é polimórfica — aceita `entidade_tipo='proposta'` sem mudar nada nela | **Sim, direto** |
| Timeline/atividades | `crm.atividades` (já tem `tarefa_id`, só falta confirmar que aceita `proposta_id` — ver 2.1) | **Parcial — precisa de 1 coluna nova** |

### 1.3 Identidade visual

Não existe arquivo de logo vetorial dentro do `crm-criativamente`. A marca usada em todo o CRM é um **wordmark em texto** — "CRIATIVAMENTE" + ponto verde-limão — estilizado via CSS (`.auth-logo` em `login.html`), usando os tokens já definidos em `src/styles/tokens.css`:

- `--black` / `--near-black` (fundo escuro)
- `--accent: #9CFF19` (o verde-limão — cor de marca, usado com moderação, nunca como fundo grande)
- `--accent-ink` (texto sobre o verde)
- tipografia mono pros rótulos (`mono-label`), sans pro corpo

No repositório irmão (`Criativamente`, sites de clientes) existe um arquivo de logo raster real: `public/images/logo-icon.png` (reaproveitado como `cd-logo.png` em várias prévias de clientes) — esse é o logo oficial em imagem, útil especificamente pro cabeçalho do PDF (PDF não renderiza CSS custom properties, precisa de uma imagem ou desenho vetorial direto no jsPDF).

**Conclusão**: a identidade visual existe e é consistente (fundo escuro, verde-limão como destaque único, tipografia mono+sans, sem gradiente) — a proposta deve seguir exatamente esse padrão, tanto na página web quanto no PDF, usando o `logo-icon.png` como marca no cabeçalho do PDF.

### 1.4 Multas técnicas a evitar (achados da auditoria, não do seu pedido)

- O schema atual **não tem** um módulo de e-mail transacional genérico fácil de acoplar — existe `email-enviar` (Edge Function, `verify_jwt: true`, dispara via Resend) e `email-entrada`/`email-anexo` pro fluxo de caixa de entrada. Dá pra reaproveitar `email-enviar` pra notificar quando a proposta for aceita/recusada, mas o **envio pro cliente é manual via WhatsApp/e-mail**, exatamente como você pediu na seção 16 (nunca automático).
- `crm.produtos_servicos` já tem todos os campos de escopo estruturado (`escopo_objeto`, `escopo_quantidade_maxima_aulas`, `escopo_modalidade_gravacao` etc.) e `termos_contratuais` — o snapshot de proposta vai copiar exatamente os mesmos campos que `contrato_itens` já copia hoje.
- `crm.papel_permissoes` ainda não tem nenhuma linha pro módulo `propostas` (ele existe em `crm.modulos`, mas nenhum papel tem `visualizar`/`criar`/etc. configurado pra ele ainda) — vai precisar de seed, igual foi feito quando o módulo Comercial da Roberta foi criado.

---

## 2. O que precisa ser criado

### 2.1 Banco de dados (schema `crm`, nenhuma migration aplicada ainda)

- **Recriar `crm.propostas`** (dropar a versão de 0 linhas e remodelar): `empresa_id`, `contato_id`, `oportunidade_id`, `titulo`, `codigo` (número/código curto exibido), `status` (`rascunho`/`enviada`/`visualizada`/`aceita`/`recusada`/`expirada`/`cancelada`/`substituida`), `validade_at`, `introducao`, `contexto`, `objetivo`, `descricao_solucao`, `condicoes_especiais`, `proximos_passos`, `condicao_pagamento_*` (mesmas colunas estruturadas de `contratos`), `valor_tabela_total`, `valor_negociado_total`, `desconto_total`, `contrato_id` (preenchido só depois da conversão), `versao_atual`, `criado_por`/`atualizado_por` (mesmo padrão de rastro de autor já usado em contatos/oportunidades/contratos).
- **`crm.proposta_itens`**: espelha `contrato_itens` — `produto_id` (opcional, pode ser item avulso sem existir no catálogo), snapshot de escopo, `valor_tabela_unitario`/`valor_negociado_unitario`/`desconto_unitario`/`valor_total`, trigger de auto-snapshot igual ao de contratos.
- **`crm.proposta_bonus`**: espelha `contrato_bonus`.
- **`crm.proposta_versoes`**: espelha `contratos_versoes` (versão, documento_id do PDF daquela versão, motivo da nova versão).
- **`crm.proposta_links`**: espelha `contrato_links`, mas **tabela própria** (token_hash, expires_at, status, empresa_id, proposta_id) — escopo separado de contrato, como você pediu.
- **`crm.proposta_eventos`** (ou reaproveitar `crm.atividades` com `proposta_id` novo): registra criação/edição/envio/primeira visualização/aceite/recusa/expiração/cancelamento/nova versão/conversão em contrato. Avaliação: `atividades` já tem o padrão certo (é o que o trigger antigo já fazia) — só precisa da coluna `proposta_id`. Mais simples que criar tabela nova, e mantém um único lugar de timeline pro CRM inteiro.
- **Ajuste em `crm.atividades`**: `ALTER TABLE crm.atividades ADD COLUMN proposta_id uuid REFERENCES crm.propostas(id)`.
- **Ajuste em `crm.contratos`**: `ADD COLUMN proposta_origem_id uuid REFERENCES crm.propostas(id)` — pra registrar de qual proposta o contrato veio (seção 14), e permitir checar "essa proposta já virou contrato?" antes de converter de novo (idempotência).
- **Seed de permissões**: linhas em `crm.papel_permissoes` pro módulo `propostas` (visualizar/criar/editar/excluir/enviar/converter — avaliar se cabe nas ações padrão do enum `crm.acao_permissao` ou se precisa de ação nova).

### 2.2 Edge Functions novas

- `proposta-gerar-link` — espelha `contrato-gerar-link` (autenticado, gera token, salva só o hash).
- `proposta-publica` — espelha `contrato-publico` (pública, `verify_jwt:false`, resolve tudo via token, nunca expõe dado de outra empresa/proposta).
- `proposta-responder` — ação de aceite/recusa pelo link público (análogo à parte de assinatura do `contrato-publico`, mas mais simples: não tem captura de assinatura, só confirmação).
- `proposta-converter-contrato` — a mais delicada: lê a proposta + itens + bônus, cria um `contrato` + `contrato_itens` + `contrato_bonus` novos a partir do snapshot da proposta, marca `propostas.contrato_id`, bloqueia dupla conversão (se já existe `contrato_id`, devolve o contrato existente em vez de duplicar).

### 2.3 Frontend

- `propostas.html` (listagem, igual ao padrão de `tarefas.html`/`pipeline.html` — filtros, não precisa de view separada do zero).
- `proposta-editor.html` ou um modo dentro de `ficha-oportunidade.html` pro fluxo de criação/edição (seleção de produtos, preços, condições, prévia).
- `proposta-publica.html` (página pública, espelha `contrato-publico.html` em estrutura, com a identidade visual descrita em 1.3).
- Seção "Propostas" dentro de `ficha-cliente.html` e `ficha-oportunidade.html` (lista + status + link pra cada uma).
- Geração de PDF: reaproveita o padrão `jsPDF` já usado em `contrato-publico.html`.

---

## 3. Riscos identificados

| Risco | Como estou mitigando no plano |
|---|---|
| Confundir "proposta aceita" com "contrato assinado" ou "pagamento recebido" | Três conceitos/tabelas totalmente separados — aceite da proposta é só um evento na proposta; a conversão em contrato cria um contrato em `rascunho`, que segue o fluxo normal de assinatura já existente, sem pular etapa |
| Conversão duplicada (duplicar contrato) | `propostas.contrato_id` funciona como trava — a function de conversão checa isso antes de criar, e devolve o contrato existente se já houver |
| Link de proposta reaproveitando token de contrato por engano | Tabela e função própria (`proposta_links`, não `contrato_links`) — isolamento total |
| Proposta antiga mudar quando o catálogo mudar | Mesmo mecanismo de snapshot que já funciona em `contrato_itens` — testado e em produção há semanas |
| PDF e página mostrarem conteúdo diferente | Mesmo padrão de contratos: o PDF é gerado no cliente a partir do mesmo payload que renderizou a página, nunca uma segunda fonte de verdade |

---

## 4. Plano de fases (igual ao que você pediu na seção 22, ajustado ao que já existe)

1. **Fase 1 — Auditoria** ✅ (este documento)
2. **Fase 2 — Modelo de dados**: migrations criando `proposta_itens`, `proposta_bonus`, `proposta_versoes`, `proposta_links`, recriando `propostas`, alterando `atividades` e `contratos`. Nenhum dado real em risco (tabela antiga tem 0 linhas).
3. **Fase 3 — Editor interno**: tela de criação/edição + seleção de produtos + prévia.
4. **Fase 4 — PDF**: geração via jsPDF, mesmo padrão de contratos.
5. **Fase 5 — Página pública**: `proposta-publica` (function) + `proposta-publica.html`.
6. **Fase 6 — Aceite e histórico**: `proposta-responder`, eventos em `atividades`.
7. **Fase 7 — Conversão em contrato**: `proposta-converter-contrato`, com proteção contra duplicação.
8. **Fase 8 — Testes e deploy**: matriz de testes da seção 21 do seu documento, só sobe depois de aprovação explícita.

---

## 5. Pendências que preciso que você decida antes da Fase 2

1. **A tabela `crm.propostas` atual (0 linhas, nunca usada) pode ser dropada e recriada do zero?** Recomendo que sim — tentar fazer `ALTER TABLE` incremental nela seria mais trabalho e mais arriscado do que recriar limpa, e não existe dado real pra perder.
2. **Eventos da proposta: uma tabela nova (`proposta_eventos`) ou reaproveitar `crm.atividades`** (como já era feito pelo trigger antigo, só adicionando a coluna `proposta_id`)? Minha recomendação é reaproveitar `atividades` — mantém uma timeline única no CRM, igual já funciona pra contato/oportunidade/contrato/projeto/tarefa.
3. **Ações de permissão**: o enum `crm.acao_permissao` hoje tem `visualizar/criar/editar/excluir/exportar/administrar` — "enviar" e "converter em contrato" cabem dentro de `editar`, ou você quer ações específicas no enum (mais granular, mais trabalho de seed depois)?
4. Confirma que o PDF deve usar o `logo-icon.png` do repositório `Criativamente` como marca oficial (é a única imagem de logo real que encontrei)?

Nenhuma migration foi aplicada, nenhum deploy foi feito. Aguardando aprovação pra avançar pra Fase 2.
