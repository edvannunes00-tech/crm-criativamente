// ============================================================
// Edge Function: contrato-pagamento-sinal  (publica; autenticacao = token do link ja ASSINADO)
// ------------------------------------------------------------
// Depois que o cliente assina, se o contrato tiver crm.contratos.sinal_valor definido, a pagina
// publica oferece pagar o sinal ali mesmo: Payment Brick embutido (cartao OU Pix, sem
// redirecionar pro Mercado Pago), mesmo padrao ja validado em producao no
// Agenda.Criativamente. Valor sempre o EXATO cadastrado no contrato (nunca calculado a partir
// de texto livre, nunca confiado do navegador) -- revalidado dentro de
// registrar_pagamento_avulso_pendente, nunca so aqui.
//  * acao "config"  -> devolve a Public Key (nao e segredo, pode ir pro navegador).
//  * acao "status"  -> diz se ha sinal configurado e o estado do pagamento mais recente
//    (reconsulta a API oficial quando ainda pendente, nunca confia no navegador).
//  * acao "cobrar"  -> cria o pagamento na Payments API (/v1/payments) com o output do
//    Payment Brick (token+parcelas pro cartao, so o metodo pro Pix) e registra o resultado.
// Falha em qualquer credencial/config -> motivo explicito, nunca finge que esta pronto.
// ============================================================
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const MP_API = "https://api.mercadopago.com";

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

function mapearStatusMp(status: string | undefined): "aprovado" | "recusado" | "pendente" | "estornado" | "cancelado" {
  switch (status) {
    case "approved": return "aprovado";
    case "rejected": return "recusado";
    case "refunded": case "charged_back": return "estornado";
    case "cancelled": return "cancelado";
    default: return "pendente"; // pending, in_process, authorized
  }
}

async function contextoDoLink(db: ReturnType<typeof admin>, token: string) {
  // Sinal so pode ser pago DEPOIS de assinado (link 'confirmado'), igual a copia do contrato --
  // nunca antes de o cliente ler o contrato inteiro e confirmar os dados.
  const { data: link } = await db.from("contrato_links").select("id, empresa_id, contrato_id, status").eq("token_hash", await sha256Hex(token)).maybeSingle();
  if (!link || link.status !== "confirmado") return null;
  const { data: contrato } = await db.from("contratos").select("id, titulo, sinal_valor").eq("id", link.contrato_id).maybeSingle();
  if (!contrato || !contrato.sinal_valor || Number(contrato.sinal_valor) <= 0) return { link, contrato: null };
  return { link, contrato };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: CORS_HEADERS });
  try {
    if (req.method !== "POST") return json({ error: "Metodo nao permitido" }, 405);
    let body: Row;
    try { body = await req.json(); } catch { return json({ error: "Corpo invalido" }, 400); }
    const acao = body.acao;
    if (!["config", "status", "cobrar"].includes(acao)) return json({ error: "acao deve ser 'config', 'status' ou 'cobrar'" }, 400);

    const mpToken = Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN");
    const mpPublicKey = Deno.env.get("MERCADO_PAGO_PUBLIC_KEY");
    const db = admin();

    if (acao === "config") {
      if (!mpPublicKey) return json({ ok: false, motivo: "pagamento_nao_configurado" });
      return json({ ok: true, publicKey: mpPublicKey });
    }

    const token = body.token;
    if (!token || typeof token !== "string") return json({ error: "token e obrigatorio" }, 400);
    const ctx = await contextoDoLink(db, token);
    if (!ctx) return json({ ok: false, motivo: "link_indisponivel" });
    if (!ctx.contrato) return json({ ok: false, motivo: "sem_sinal_configurado" });

    const { data: pagamentos } = await db.from("contrato_pagamentos_avulsos").select("*")
      .eq("contrato_id", ctx.link.contrato_id).eq("tipo", "sinal").order("created_at", { ascending: false });
    let atual: Row | null = (pagamentos ?? [])[0] ?? null;

    if (acao === "status") {
      if (atual && atual.status === "pendente" && atual.provider_payment_id && mpToken) {
        const r = await fetch(`${MP_API}/v1/payments/${encodeURIComponent(atual.provider_payment_id)}`, { headers: { Authorization: `Bearer ${mpToken}` } });
        if (r.ok) {
          const mp = await r.json();
          const { data: atualizado } = await db.rpc("aplicar_pagamento_avulso_mp", {
            p_pagamento_id: atual.id, p_status: mapearStatusMp(mp.status), p_status_provedor: String(mp.status ?? ""),
            p_provider_payment_id: String(mp.id), p_qr_code: null, p_qr_code_base64: null, p_pago_em: mp.date_approved ?? null,
          });
          atual = atualizado ?? atual;
        }
      }
      return json({
        ok: true, configurado: Boolean(mpToken && mpPublicKey), valor: Number(ctx.contrato.sinal_valor),
        pagamento: atual ? { id: atual.id, status: atual.status, metodo: atual.metodo, valor: Number(atual.valor), qr_code: atual.qr_code, qr_code_base64: atual.qr_code_base64 } : null,
      });
    }

    // ---- acao === "cobrar" ----
    if (!mpToken || !mpPublicKey) return json({ ok: false, motivo: "pagamento_nao_configurado" });
    if (atual && atual.status === "aprovado") return json({ ok: false, motivo: "sinal_ja_pago" });

    const formData = body.formData as Row | undefined;
    if (!formData || !formData.payer?.email) return json({ error: "dados do Payment Brick incompletos (payer.email ausente)" }, 400);
    if (!formData.payment_method_id) return json({ error: "payment_method_id ausente no formData do Brick" }, 400);
    // metodo vem do proprio formData que o Payment Brick devolveu, nunca de um campo
    // separado do navegador (evitaria que o cliente mandasse um "metodo" divergente
    // do que o Brick realmente tokenizou).
    const metodo = formData.payment_method_id === "pix" ? "pix" : "cartao";
    if (metodo === "cartao" && !formData.token) return json({ error: "token do cartao ausente (Payment Brick nao tokenizou)" }, 400);

    // revalida tudo de novo no servidor (contrato existe, sinal configurado, nao pago ainda)
    // e le o valor EXATO de contratos.sinal_valor -- nunca confia em nenhum valor do navegador.
    let pagamento: Row;
    try {
      const { data, error } = await db.rpc("registrar_pagamento_avulso_pendente", {
        p_contrato_id: ctx.link.contrato_id, p_metodo: metodo,
      });
      if (error) throw error;
      pagamento = data;
    } catch (e) {
      return json({ ok: false, motivo: "nao_e_possivel_cobrar", detalhe: (e as Error).message }, 400);
    }

    // Mapeamento explicito (nao um spread cego de formData): so os campos que o
    // Payment Brick realmente precisa repassar pro Payments API, nada a mais.
    // undefined some do corpo no JSON.stringify -- token/installments/issuer_id
    // so vao quando o metodo e cartao.
    // https://github.com/mercadopago/sdk-js/blob/main/docs/bricks/payment.md
    const mpBody: Row = {
      transaction_amount: Number(pagamento.valor),
      description: `Sinal — ${ctx.contrato.titulo}`,
      external_reference: pagamento.id,
      notification_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/mercadopago-webhook`,
      payment_method_id: formData.payment_method_id,
      payer: { email: formData.payer.email, identification: formData.payer.identification },
      token: metodo === "cartao" ? formData.token : undefined,
      installments: metodo === "cartao" ? (formData.installments ?? 1) : undefined,
      issuer_id: metodo === "cartao" ? formData.issuer_id : undefined,
    };

    const resp = await fetch(`${MP_API}/v1/payments`, {
      method: "POST",
      headers: { Authorization: `Bearer ${mpToken}`, "Content-Type": "application/json", "X-Idempotency-Key": pagamento.id },
      body: JSON.stringify(mpBody),
    });
    if (!resp.ok) {
      let d: Row = {}; try { d = await resp.json(); } catch { /* sem corpo */ }
      await db.rpc("aplicar_pagamento_avulso_mp", {
        p_pagamento_id: pagamento.id, p_status: "recusado", p_status_provedor: `erro_provedor_${resp.status}`,
        p_provider_payment_id: null, p_qr_code: null, p_qr_code_base64: null, p_pago_em: null,
      });
      if (Deno.env.get("MERCADO_PAGO_DEBUG") !== "1") return json({ ok: false, motivo: "falha_no_provedor" });
      return json({ ok: false, motivo: "falha_no_provedor", debug: { http: resp.status, message: d.message, cause: d.cause } });
    }

    const mp = await resp.json();
    const statusMapeado = mapearStatusMp(mp.status);
    // point_of_interaction.transaction_data -- so presente em pagamentos Pix.
    const qrCode = mp.point_of_interaction?.transaction_data?.qr_code ?? null;
    const qrCodeBase64 = mp.point_of_interaction?.transaction_data?.qr_code_base64 ?? null;
    const ticketUrl = mp.point_of_interaction?.transaction_data?.ticket_url ?? null;
    const { data: atualizado } = await db.rpc("aplicar_pagamento_avulso_mp", {
      p_pagamento_id: pagamento.id, p_status: statusMapeado, p_status_provedor: String(mp.status ?? ""),
      p_provider_payment_id: String(mp.id), p_qr_code: qrCode, p_qr_code_base64: qrCodeBase64, p_pago_em: mp.date_approved ?? null,
    });
    const final = atualizado ?? pagamento;
    return json({
      ok: true,
      pagamento: { id: final.id, status: final.status, metodo: final.metodo, valor: Number(final.valor), qr_code: final.qr_code, qr_code_base64: final.qr_code_base64 },
      paymentId: String(mp.id), status_detail: mp.status_detail ?? null, ticket_url: ticketUrl,
    });
  } catch (_e) {
    return json({ ok: false, motivo: "erro_interno" }, 500);
  }
});
