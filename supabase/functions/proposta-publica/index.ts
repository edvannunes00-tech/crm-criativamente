// ============================================================
// Edge Function: proposta-publica  (publica; sem sessao -- autenticacao = token do link)
// ------------------------------------------------------------
// GET: carrega os dados da proposta a partir do hash do token. Nunca expoe
//   dado de outra proposta/empresa -- tudo resolvido via crm.registrar_acesso_link_proposta.
// POST acao "responder": aceite/recusa do cliente pelo link publico.
// Separado de contrato-publico de proposito (seção 12 do escopo aprovado):
//   token e tabela proprios (crm.proposta_links), nunca reaproveita contrato_links.
// ============================================================
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
}
async function sha256Hex(texto: string): Promise<string> {
  const dados = new TextEncoder().encode(texto);
  const hash = await crypto.subtle.digest("SHA-256", dados);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function admin() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { db: { schema: "crm" } });
}

async function dadosContratada(db: ReturnType<typeof admin>, empresaId: string) {
  const { data: empresaRow } = await db.from("empresas").select("nome").eq("id", empresaId).maybeSingle();
  const { data: fiscalRow } = await db.from("configuracoes").select("valor").eq("empresa_id", empresaId).eq("chave", "dados_fiscais_contratada").maybeSingle();
  const fiscal = (fiscalRow?.valor as Record<string, string | null>) ?? {};
  return { nome: fiscal.razao_social || empresaRow?.nome || "Criativamente" };
}

async function handleGet(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const token = url.searchParams.get("t");
  if (!token) return json({ error: "Parametro t (token) e obrigatorio" }, 400);

  const db = admin();
  const tokenHash = await sha256Hex(token);
  const { data: acessoRows, error: acessoErr } = await db.rpc("registrar_acesso_link_proposta", { p_token_hash: tokenHash });
  if (acessoErr) return json({ error: "Falha ao validar o link." }, 500);
  const acesso = acessoRows?.[0];
  if (!acesso) return json({ disponivel: false }, 200);

  const { data: proposta, error: propostaErr } = await db
    .from("propostas")
    .select(
      "empresa_id, titulo, codigo, status, validade_at, introducao, contexto, objetivo, descricao_solucao, " +
        "condicoes_especiais, proximos_passos, condicao_pagamento_tipo, condicao_pagamento_percentual_entrada, forma_pagamento, " +
        "parcelas_quantidade, parcelas_periodicidade, parcelas_observacao, valor_tabela_total, valor_negociado_total, " +
        "desconto_total, contato_id, contrato_id"
    )
    .eq("id", acesso.proposta_id)
    .maybeSingle();
  if (propostaErr || !proposta) return json({ disponivel: false }, 200);

  const { data: contato } = await db.from("contatos").select("nome").eq("id", proposta.contato_id).maybeSingle();
  const { data: itens } = await db
    .from("proposta_itens")
    .select("descricao, quantidade, valor_tabela_unitario, valor_negociado_unitario, valor_total, escopo_objeto, escopo_observacoes")
    .eq("proposta_id", acesso.proposta_id);
  const { data: bonus } = await db.from("proposta_bonus").select("descricao, quantidade").eq("proposta_id", acesso.proposta_id);

  const { empresa_id: _e, contato_id: _c, contrato_id, ...propostaPublica } = proposta;

  return json(
    {
      disponivel: true,
      status_link: acesso.status_link,
      proposta: {
        ...propostaPublica,
        cliente_nome: contato?.nome ?? null,
        itens: itens ?? [],
        bonus: bonus ?? [],
        ja_convertida_em_contrato: Boolean(contrato_id),
      },
      contratada: await dadosContratada(db, proposta.empresa_id),
    },
    200
  );
}

async function handlePost(req: Request): Promise<Response> {
  let body: { token?: string; acao?: string; resposta?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Corpo invalido" }, 400);
  }
  const { token, acao } = body;
  if (!token) return json({ error: "token e obrigatorio" }, 400);
  if (acao !== "responder") return json({ error: "acao deve ser 'responder'" }, 400);
  if (body.resposta !== "aceita" && body.resposta !== "recusada") return json({ error: "resposta deve ser 'aceita' ou 'recusada'" }, 400);

  const db = admin();
  const tokenHash = await sha256Hex(token);
  const { data, error } = await db.rpc("responder_proposta", { p_token_hash: tokenHash, p_resposta: body.resposta });
  if (error) return json({ ok: false, motivo: "erro_interno" }, 500);
  const resultado = data?.[0];
  if (!resultado) return json({ ok: false, motivo: "erro_interno" }, 500);
  return json({ ok: resultado.ok, motivo: resultado.motivo ?? undefined }, 200);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: CORS_HEADERS });
  try {
    if (req.method === "GET") return await handleGet(req);
    if (req.method === "POST") return await handlePost(req);
    return json({ error: "Metodo nao permitido" }, 405);
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
