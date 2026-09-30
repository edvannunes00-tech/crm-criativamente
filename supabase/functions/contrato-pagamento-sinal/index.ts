// ============================================================
// Edge Function: contrato-pagamento-sinal  (publica; autenticacao = token do link ja ASSINADO)
// ------------------------------------------------------------
// Depois que o cliente assina, se o contrato tiver crm.contratos.sinal_valor definido, a pagina
// publica oferece pagar o sinal ali mesmo: o cliente escolhe CARTAO ou PIX, cada um abre um
// Checkout Pro (preference) do Mercado Pago restrito aquele meio, com o valor EXATO cadastrado
// no contrato (nunca calculado a partir de texto livre). Pagamento UNICO, nao recorrente --
// nao usa preapproval nem a tabela de assinaturas_recorrentes.
//  * acao "status": diz se ha sinal configurado e o estado do pagamento mais recente (sincroniza
//    com a API oficial quando ainda pendente, nunca confia no navegador).
//  * acao "iniciar": cria a preference no Mercado Pago e devolve o checkout_url.
// Falha em qualquer credencial/config -> motivo explicito, nunca finge que esta pronto.
// ============================================================
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const MP_API = "https://api.mercadopago.com";
const SITE_URL = Deno.env.get("SITE_URL") ?? "https://crm.criativamentedigital.com.br";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
}
async function sha256Hex(t: string): Promise<string> {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
  return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("");
}
const admin = () => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { db: { schema: "crm" } });
// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

async function contextoDoLink(db: ReturnType<typeof admin>, token: string) {
  // Sinal so pode ser pago DEPOIS de assinado (link 'confirmado'), igual a copia do contrato --
  // nunca antes de o cliente ler o contrato inteiro e confirmar os dados.
  const { data: link } = await db.from("contrato_links").select("id, empresa_id, contrato_id, status").eq("token_hash", await sha256Hex(token)).maybeSingle();
  if (!link || link.status !== "confirmado") return null;
  const { data: contrato } = await db.from("contratos").select("id, titulo, sinal_valor").eq("id", link.contrato_id).maybeSingle();
  if (!contrato || !contrato.sinal_valor || Number(contrato.sinal_valor) <= 0) return { link, contrato: null };
  return { link, contrato };
}

async function sincronizarComProvedor(db: ReturnType<typeof admin>, mpToken: string, pagamento: Row) {
  if (!pagamento.provider_preference_id) return;
  // Busca pagamentos associados a esta preference pela API de busca (nao ha get direto por preference).
  const r = await fetch(`${MP_API}/v1/payments/search?external_reference=${encodeURIComponent(pagamento.id)}`, { headers: { Authorization: `Bearer ${mpToken}` } });
  if (!r.ok) return;
  const dados = await r.json().catch(() => null);
  const encontrado = (dados?.results ?? [])[0];
  if (!encontrado) return;
  const mapa: Record<string, string> = { approved: "aprovado", rejected: "recusado", refunded: "estornado", charged_back: "estornado", cancelled: "cancelado" };
  const status = mapa[String(encontrado.status)] ?? null;
  if (!status) return;
  await db.rpc("registrar_pagamento_avulso", {
    p_provider_preference_id: pagamento.provider_preference_id, p_provider_payment_id: String(encontrado.id),
    p_status: status, p_status_provedor: String(encontrado.status ?? ""), p_valor: Number(encontrado.transaction_amount ?? 0),
    p_pago_em: encontrado.date_approved ?? null,
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: CORS_HEADERS });
  try {
    if (req.method !== "POST") return json({ error: "Metodo nao permitido" }, 405);
    let body: { token?: string; acao?: string; metodo?: string };
    try { body = await req.json(); } catch { return json({ error: "Corpo invalido" }, 400); }
    const { token, acao } = body;
    if (!token || typeof token !== "string") return json({ error: "token e obrigatorio" }, 400);
    if (acao !== "iniciar" && acao !== "status") return json({ error: "acao deve ser 'iniciar' ou 'status'" }, 400);

    const db = admin();
    const ctx = await contextoDoLink(db, token);
    if (!ctx) return json({ ok: false, motivo: "link_indisponivel" });
    if (!ctx.contrato) return json({ ok: false, motivo: "sem_sinal_configurado" });

    const mpToken = Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN");
    const { data: pagamentos } = await db.from("contrato_pagamentos_avulsos").select("*")
      .eq("contrato_id", ctx.link.contrato_id).eq("tipo", "sinal").order("created_at", { ascending: false });
    let atual: Row | null = (pagamentos ?? [])[0] ?? null;

    if (acao === "status") {
      if (atual && atual.status === "pendente" && mpToken) {
        await sincronizarComProvedor(db, mpToken, atual);
        const { data: reler } = await db.from("contrato_pagamentos_avulsos").select("*").eq("id", atual.id).maybeSingle();
        atual = reler ?? atual;
      }
      return json({
        ok: true, configurado: Boolean(mpToken), valor: Number(ctx.contrato.sinal_valor),
        pagamento: atual ? { status: atual.status, metodo: atual.metodo, valor: Number(atual.valor), checkout_url: atual.checkout_url } : null,
      });
    }

    // ---- iniciar ----
    const metodo = body.metodo;
    if (metodo !== "cartao" && metodo !== "pix") return json({ error: "metodo deve ser 'cartao' ou 'pix'" }, 400);
    if (!mpToken) return json({ ok: false, motivo: "pagamento_nao_configurado" });
    if (atual && atual.status === "aprovado") return json({ ok: false, motivo: "sinal_ja_pago" });
    if (atual && atual.status === "pendente" && atual.metodo === metodo && atual.checkout_url) {
      return json({ ok: true, checkout_url: atual.checkout_url });
    }

    const { data: novo, error: errIns } = await db.from("contrato_pagamentos_avulsos").insert({
      empresa_id: ctx.link.empresa_id, contrato_id: ctx.link.contrato_id, tipo: "sinal", metodo, valor: ctx.contrato.sinal_valor,
    }).select("*").single();
    if (errIns || !novo) return json({ ok: false, motivo: "erro_interno" });

    const excluidos = metodo === "pix"
      ? [{ id: "credit_card" }, { id: "debit_card" }, { id: "prepaid_card" }, { id: "ticket" }, { id: "atm" }]
      : [{ id: "bank_transfer" }, { id: "ticket" }, { id: "atm" }];

    const resp = await fetch(`${MP_API}/checkout/preferences`, {
      method: "POST",
      headers: { Authorization: `Bearer ${mpToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [{ title: `Sinal — ${ctx.contrato.titulo}`, quantity: 1, unit_price: Number(ctx.contrato.sinal_valor), currency_id: "BRL" }],
        external_reference: novo.id,
        payment_methods: { excluded_payment_types: excluidos, installments: 1 },
        back_urls: {
          success: `${SITE_URL}/contrato-publico.html?sinal=retorno&ref=${novo.id}`,
          pending: `${SITE_URL}/contrato-publico.html?sinal=retorno&ref=${novo.id}`,
          failure: `${SITE_URL}/contrato-publico.html?sinal=retorno&ref=${novo.id}`,
        },
        notification_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/mercadopago-webhook`,
        auto_return: "approved",
      }),
    });
    if (!resp.ok) {
      if (Deno.env.get("MERCADO_PAGO_DEBUG") !== "1") return json({ ok: false, motivo: "falha_no_provedor" });
      let d: Row = {}; try { d = await resp.json(); } catch { /* sem corpo */ }
      return json({ ok: false, motivo: "falha_no_provedor", debug: { http: resp.status, message: d.message, error: d.error } });
    }
    const mp = await resp.json();
    if (!mp.id || !mp.init_point) return json({ ok: false, motivo: "falha_no_provedor" });

    await db.from("contrato_pagamentos_avulsos").update({ provider_preference_id: String(mp.id), checkout_url: mp.init_point }).eq("id", novo.id);
    return json({ ok: true, checkout_url: mp.init_point });
  } catch (_e) {
    return json({ ok: false, motivo: "erro_interno" }, 500);
  }
});
