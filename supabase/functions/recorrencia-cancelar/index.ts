// ============================================================
// Edge Function: recorrencia-cancelar  (verify_jwt = true)
// ------------------------------------------------------------
// Cancela a assinatura recorrente no Mercado Pago. O status local so muda depois que a
// API do provedor confirma o cancelamento (resposta real), nunca por suposicao.
// Preserva historico/cobrancas; nao apaga nada; nao faz estorno.
// ============================================================
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const MP_API = "https://api.mercadopago.com";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: CORS_HEADERS });
  try {
    if (req.method !== "POST") return json({ error: "Metodo nao permitido" }, 405);
    const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    let body: { assinatura_id?: string; motivo?: string };
    try { body = await req.json(); } catch { return json({ error: "Corpo invalido" }, 400); }
    if (!body.assinatura_id) return json({ error: "assinatura_id e obrigatorio" }, 400);

    const supabaseUser = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: `Bearer ${jwt}` } } });
    const { data: userData, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !userData?.user) return json({ error: "Nao autenticado" }, 401);

    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { db: { schema: "crm" } });
    const { data: a } = await db.from("assinaturas_recorrentes").select("*").eq("id", body.assinatura_id).maybeSingle();
    if (!a) return json({ error: "Assinatura nao encontrada" }, 404);

    const { data: pode, error: permError } = await db.rpc("tem_permissao", {
      p_usuario_id: userData.user.id, p_empresa_id: a.empresa_id, p_modulo_chave: "contratos", p_acao: "editar",
    });
    if (permError || !pode) return json({ error: "Sem permissao." }, 403);
    if (["cancelado", "encerrado"].includes(a.status_financeiro)) return json({ ok: true, ja_cancelada: true });

    const mpToken = Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN");
    if (!mpToken) return json({ ok: false, motivo: "pagamento_nao_configurado" });

    if (a.provider_subscription_id) {
      const r = await fetch(`${MP_API}/preapproval/${encodeURIComponent(a.provider_subscription_id)}`, {
        method: "PUT", headers: { Authorization: `Bearer ${mpToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ status: "cancelled" }),
      });
      if (!r.ok) return json({ ok: false, motivo: "falha_no_provedor" });
      const o = await r.json();
      if (o.status !== "cancelled") return json({ ok: false, motivo: "provedor_nao_confirmou" });
    }

    await db.from("assinaturas_recorrentes").update({ cancelamento_origem: "crm", cancelamento_motivo: body.motivo ?? null }).eq("id", a.id);
    const { data: res } = await db.rpc("aplicar_preapproval", {
      p_assinatura_id: a.id, p_provider_subscription_id: a.provider_subscription_id ?? null, p_status_provedor: "cancelled",
      p_inicio: null, p_proxima: null, p_motivo: body.motivo ?? null,
    });
    return json({ ok: true, resultado: res });
  } catch (_e) {
    return json({ ok: false, motivo: "erro_interno" }, 500);
  }
});
