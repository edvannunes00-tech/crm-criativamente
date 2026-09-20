// ============================================================
// Edge Function: mercadopago-webhook  (verify_jwt = false; autenticidade = x-signature)
// ------------------------------------------------------------
// Recebe notificacoes do Mercado Pago para assinaturas recorrentes.
//  * Valida a assinatura HMAC-SHA256 (x-signature) ANTES de qualquer efeito.
//  * NUNCA confia no corpo da notificacao: busca o recurso na API OFICIAL e usa o que ela devolve.
//  * Idempotente: x-request-id unico por notificacao (reenvio = mesmo id) + regras de estado no
//    banco (mesma cobranca/estado repetido nao gera efeito nem atividade nova).
//  * Sem segredo/token configurado -> 503 (nao finge processar).
// ============================================================
import { createClient } from "jsr:@supabase/supabase-js@2";

const MP_API = "https://api.mercadopago.com";
const admin = () => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { db: { schema: "crm" } });
// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function resp(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
async function assinaturaValida(secret: string, xSignature: string | null, xRequestId: string | null, dataId: string): Promise<boolean> {
  if (!xSignature || !xRequestId || !dataId) return false;
  const partes = Object.fromEntries(xSignature.split(",").map((p) => {
    const [k, ...r] = p.trim().split("=");
    return [k, r.join("=")];
  }));
  if (!partes.ts || !partes.v1) return false;
  const manifest = `id:${dataId.toLowerCase()};request-id:${xRequestId};ts:${partes.ts};`;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(manifest));
  const hex = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return timingSafeEqualHex(hex, partes.v1);
}

async function mpGet(token: string, path: string): Promise<Row | null> {
  const r = await fetch(`${MP_API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  return r.ok ? await r.json() : null;
}

function mapearPagamento(status: string | undefined): "aprovada" | "recusada" | "pendente" | "estornada" | "cancelada" | null {
  switch (status) {
    case "approved": return "aprovada";
    case "rejected": return "recusada";
    case "pending": case "in_process": case "authorized": return "pendente";
    case "refunded": case "charged_back": return "estornada";
    case "cancelled": return "cancelada";
    default: return null;
  }
}

async function processar(db: ReturnType<typeof admin>, token: string, tipo: string, id: string): Promise<string> {
  if (tipo === "subscription_preapproval" || tipo === "preapproval") {
    const o = await mpGet(token, `/preapproval/${encodeURIComponent(id)}`);
    if (!o) return "recurso_indisponivel";
    const ref = o.external_reference;
    if (!ref || !UUID.test(ref)) return "sem_referencia_valida";
    const { data: a } = await db.from("assinaturas_recorrentes").select("id, provider_subscription_id").eq("id", ref).maybeSingle();
    if (!a) return "assinatura_desconhecida";
    if (a.provider_subscription_id && a.provider_subscription_id !== String(o.id)) return "referencia_divergente";
    const { data } = await db.rpc("aplicar_preapproval", {
      p_assinatura_id: a.id, p_provider_subscription_id: String(o.id), p_status_provedor: String(o.status ?? ""),
      p_inicio: o.date_created ?? null, p_proxima: o.next_payment_date ?? null, p_motivo: o.status_detail ?? null,
    });
    return `preapproval:${data}`;
  }

  if (tipo === "subscription_authorized_payment") {
    const p = await mpGet(token, `/authorized_payments/${encodeURIComponent(id)}`);
    if (!p) return "recurso_indisponivel";
    const preId = p.preapproval_id ? String(p.preapproval_id) : null;
    if (!preId) return "sem_preapproval";
    const { data: a } = await db.from("assinaturas_recorrentes").select("id").eq("provider", "mercado_pago").eq("provider_subscription_id", preId).maybeSingle();
    if (!a) return "assinatura_desconhecida";
    // "recycling" = o provedor vai tentar de novo apos uma falha.
    let status = mapearPagamento(p.payment?.status);
    if (!status && p.status === "recycling") status = "recusada";
    if (!status) return "aguardando_pagamento_no_provedor"; // ex.: scheduled, ainda sem tentativa
    const { data } = await db.rpc("registrar_cobranca_recorrente", {
      p_assinatura_id: a.id,
      p_provider_payment_id: String(p.payment?.id ?? p.id),
      p_status: status,
      p_status_provedor: String(p.payment?.status ?? p.status ?? ""),
      p_valor: Number(p.transaction_amount ?? 0),
      p_ocorrida_em: p.last_modified ?? p.date_created ?? null,
      p_detalhe: p.payment?.status_detail ?? null,
      p_proxima: p.next_retry_date ?? null,
    });
    return `cobranca:${data}`;
  }

  return "tipo_ignorado";
}

Deno.serve(async (req: Request) => {
  const secret = Deno.env.get("MERCADO_PAGO_WEBHOOK_SECRET");
  const mpToken = Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN");
  if (!secret || !mpToken) return resp(503, { error: "webhook_nao_configurado" });

  try {
    const url = new URL(req.url);
    let body: Row = {};
    if (req.method === "POST") { try { body = await req.json(); } catch { body = {}; } }
    const dataId = url.searchParams.get("data.id") ?? url.searchParams.get("id") ?? String(body?.data?.id ?? "");
    const tipo = url.searchParams.get("type") ?? url.searchParams.get("topic") ?? String(body?.type ?? "");
    const xRequestId = req.headers.get("x-request-id");

    if (!(await assinaturaValida(secret, req.headers.get("x-signature"), xRequestId, dataId))) return resp(401, { error: "assinatura_invalida" });

    const db = admin();
    const chave = `${xRequestId}`;
    const { error: errEv } = await db.from("eventos_webhook_pagamento").insert({ evento_id_externo: chave, tipo, recurso_id: dataId });
    if (errEv) {
      // Reenvio do mesmo evento: so reprocessa se a tentativa anterior nao chegou ao fim.
      const { data: ja } = await db.from("eventos_webhook_pagamento").select("processado_em").eq("provider", "mercado_pago").eq("evento_id_externo", chave).maybeSingle();
      if (ja?.processado_em) return resp(200, { ok: true, duplicado: true });
    }

    const resultado = await processar(db, mpToken, tipo, dataId);
    await db.from("eventos_webhook_pagamento").update({ processado_em: new Date().toISOString(), resultado }).eq("provider", "mercado_pago").eq("evento_id_externo", chave);
    return resp(200, { ok: true, resultado });
  } catch (_e) {
    return resp(500, { error: "erro_interno" }); // 5xx => o provedor reenvia
  }
});
