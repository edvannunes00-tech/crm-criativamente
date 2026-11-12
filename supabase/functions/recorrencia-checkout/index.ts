// ============================================================
// Edge Function: recorrencia-checkout  (publica; autenticacao = token do link)
// ------------------------------------------------------------
// acao "iniciar": comeca a recorrencia (manutencao/suporte) com o metodo
//   escolhido pelo cliente -- "cartao" (Preapproval do Mercado Pago, JA
//   autorizado com o token que o Payment Brick tokenizou) ou "pix". O
//   Mercado Pago nao tem Pix recorrente (Preapproval so aceita cartao), por
//   isso o Pix aqui e uma cobranca avulsa por COMPETENCIA (mes): o cliente
//   volta nesta mesma pagina todo mes pra gerar e pagar o Pix daquele mes
//   (acao "cobrar-pix-mes"). Valor e periodicidade vem do CATALOGO no
//   servidor, nunca do navegador. Nenhum dado de cartao passa por aqui, so
//   o token de uso unico.
// acao "cobrar-pix-mes": gera (ou reaproveita, se ja pendente) o Pix do mes
//   atual pra uma recorrencia Pix ja existente -- usado nos meses seguintes
//   ao primeiro.
// acao "status": devolve o estado financeiro real. Se ainda aguarda
//   confirmacao (cartao) ou tem Pix do mes pendente, reconsulta a API
//   oficial do provedor e aplica o resultado (nunca confia no navegador).
// acao "config": devolve a Public Key (nao e segredo, pode ir pro navegador).
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
  const { data: link } = await db.from("contrato_links").select("id, empresa_id, contrato_id, status").eq("token_hash", await sha256Hex(token)).maybeSingle();
  if (!link || (link.status !== "dados_confirmados" && link.status !== "confirmado")) return null; // so depois de o cliente confirmar os dados
  // Tipo e valores contratados vem do SNAPSHOT do item (migration 30): cobra o que foi contratado.
  const { data: itens } = await db.from("contrato_itens")
    .select("produto_id, descricao, recorrencia_tipo, recorrencia_valor_mensal, recorrencia_valor_anual")
    .eq("contrato_id", link.contrato_id).not("recorrencia_tipo", "is", null).limit(1);
  const item = (itens ?? [])[0];
  if (!item) return { link, produto: null };
  return { link, produto: { id: item.produto_id, nome: item.descricao ?? "Manutencao e Suporte", recorrencia_tipo: item.recorrencia_tipo, recorrencia_valor_mensal: item.recorrencia_valor_mensal, recorrencia_valor_anual: item.recorrencia_valor_anual } };
}

async function sincronizarComProvedor(db: ReturnType<typeof admin>, a: Row) {
  const mpToken = Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN");
  if (!mpToken || !a.provider_subscription_id) return;
  const r = await fetch(`${MP_API}/preapproval/${encodeURIComponent(a.provider_subscription_id)}`, { headers: { Authorization: `Bearer ${mpToken}` } });
  if (!r.ok) return;
  const o = await r.json();
  if (o.external_reference && o.external_reference !== a.id) return; // defesa: referencia tem que bater
  await db.rpc("aplicar_preapproval", {
    p_assinatura_id: a.id, p_provider_subscription_id: String(o.id), p_status_provedor: String(o.status ?? ""),
    p_inicio: o.date_created ?? null, p_proxima: o.next_payment_date ?? null, p_motivo: o.status_detail ?? null,
  });
}

// Pix do mes: cria (ou reaproveita) a cobranca pendente e dispara o pagamento
// Pix na Payments API. Compartilhado entre "iniciar" (1o mes) e
// "cobrar-pix-mes" (meses seguintes).
async function cobrarPixDoMes(db: ReturnType<typeof admin>, mpToken: string, assinatura: Row, email: string, nomeProduto: string) {
  let pagamento: Row;
  try {
    const { data, error } = await db.rpc("registrar_cobranca_recorrencia_pix_pendente", { p_assinatura_id: assinatura.id });
    if (error) throw error;
    pagamento = data;
  } catch (e) {
    return { ok: false as const, motivo: "nao_e_possivel_cobrar", detalhe: (e as Error).message };
  }

  if (pagamento.status === "pendente" && pagamento.qr_code) {
    // Ja existe um Pix pendente deste mes com QR gerado -- reaproveita, nao gera outro na Payments API.
    return { ok: true as const, pagamento };
  }

  const resp = await fetch(`${MP_API}/v1/payments`, {
    method: "POST",
    headers: { Authorization: `Bearer ${mpToken}`, "Content-Type": "application/json", "X-Idempotency-Key": pagamento.id },
    body: JSON.stringify({
      transaction_amount: Number(pagamento.valor),
      description: `${nomeProduto} — ${pagamento.competencia}`,
      external_reference: pagamento.id,
      notification_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/mercadopago-webhook`,
      payment_method_id: "pix",
      payer: { email },
    }),
  });
  if (!resp.ok) {
    if (Deno.env.get("MERCADO_PAGO_DEBUG") !== "1") return { ok: false as const, motivo: "falha_no_provedor" };
    let d: Row = {}; try { d = await resp.json(); } catch { /* sem corpo */ }
    return { ok: false as const, motivo: "falha_no_provedor", debug: { http: resp.status, message: d.message, cause: d.cause } };
  }
  const mp = await resp.json();
  const qrCode = mp.point_of_interaction?.transaction_data?.qr_code ?? null;
  const qrCodeBase64 = mp.point_of_interaction?.transaction_data?.qr_code_base64 ?? null;
  const { data: atualizado } = await db.rpc("aplicar_cobranca_recorrencia_pix", {
    p_pagamento_id: pagamento.id, p_status: mapearStatusMp(mp.status), p_status_provedor: String(mp.status ?? ""),
    p_provider_payment_id: String(mp.id), p_qr_code: qrCode, p_qr_code_base64: qrCodeBase64, p_pago_em: mp.date_approved ?? null,
  });
  return { ok: true as const, pagamento: atualizado ?? pagamento };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: CORS_HEADERS });
  try {
    if (req.method !== "POST") return json({ error: "Metodo nao permitido" }, 405);
    let body: Row;
    try { body = await req.json(); } catch { return json({ error: "Corpo invalido" }, 400); }
    const acao = body.acao;
    if (!["config", "status", "iniciar", "cobrar-pix-mes"].includes(acao)) {
      return json({ error: "acao deve ser 'config', 'status', 'iniciar' ou 'cobrar-pix-mes'" }, 400);
    }

    const mpToken = Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN");
    const mpPublicKey = Deno.env.get("MERCADO_PAGO_PUBLIC_KEY");

    if (acao === "config") {
      if (!mpPublicKey) return json({ ok: false, motivo: "pagamento_nao_configurado" });
      return json({ ok: true, publicKey: mpPublicKey });
    }

    const token = body.token;
    if (!token || typeof token !== "string") return json({ error: "token e obrigatorio" }, 400);

    const db = admin();
    const ctx = await contextoDoLink(db, token);
    if (!ctx) return json({ ok: false, motivo: "link_indisponivel" });
    if (!ctx.produto) return json({ ok: false, motivo: "contrato_sem_recorrencia" });

    const { data: vivas } = await db.from("assinaturas_recorrentes").select("*")
      .eq("contrato_id", ctx.link.contrato_id).not("status_financeiro", "in", "(cancelado,encerrado)").limit(1);
    let a: Row | null = (vivas ?? [])[0] ?? null;

    if (acao === "status") {
      if (a && (a.status_financeiro === "aguardando_pagamento" || a.status_financeiro === "pendente")) {
        await sincronizarComProvedor(db, a);
        const { data: atual } = await db.from("assinaturas_recorrentes").select("*").eq("id", a.id).maybeSingle();
        a = atual ?? a;
      }
      // Pix pendente do mes atual (se houver recorrencia Pix em andamento) -- re-sincroniza
      // com o provedor pra nao deixar o cliente travado num QR ja pago/expirado.
      let pixMesAtual: Row | null = null;
      if (a && !a.provider_subscription_id) {
        const competenciaAtual = new Date().toISOString().slice(0, 7);
        const { data: pg } = await db.from("contrato_pagamentos_avulsos").select("*")
          .eq("assinatura_recorrente_id", a.id).eq("competencia", competenciaAtual).order("created_at", { ascending: false }).limit(1).maybeSingle();
        pixMesAtual = pg ?? null;
        if (pixMesAtual && pixMesAtual.status === "pendente" && pixMesAtual.provider_payment_id && mpToken) {
          const r = await fetch(`${MP_API}/v1/payments/${encodeURIComponent(pixMesAtual.provider_payment_id)}`, { headers: { Authorization: `Bearer ${mpToken}` } });
          if (r.ok) {
            const mp = await r.json();
            const { data: atualizado } = await db.rpc("aplicar_cobranca_recorrencia_pix", {
              p_pagamento_id: pixMesAtual.id, p_status: mapearStatusMp(mp.status), p_status_provedor: String(mp.status ?? ""),
              p_provider_payment_id: String(mp.id), p_qr_code: null, p_qr_code_base64: null, p_pago_em: mp.date_approved ?? null,
            });
            pixMesAtual = atualizado ?? pixMesAtual;
            const { data: atual } = await db.from("assinaturas_recorrentes").select("*").eq("id", a.id).maybeSingle();
            a = atual ?? a;
          }
        }
      }
      const { data: dc } = await db.from("contrato_dados_cliente").select("assinatura_confirmada_em").eq("contrato_id", ctx.link.contrato_id).limit(1).maybeSingle();
      return json({
        ok: true,
        configurado: Boolean(mpToken && mpPublicKey),
        valores: { mensal: ctx.produto.recorrencia_valor_mensal, anual: ctx.produto.recorrencia_valor_anual },
        assinatura: a ? {
          periodicidade: a.periodicidade, valor: a.valor, status_financeiro: a.status_financeiro, proxima_cobranca_em: a.proxima_cobranca_em,
          metodo: a.provider_subscription_id ? "cartao" : "pix",
        } : null,
        pix_mes_atual: pixMesAtual ? { id: pixMesAtual.id, status: pixMesAtual.status, competencia: pixMesAtual.competencia, valor: Number(pixMesAtual.valor), qr_code: pixMesAtual.qr_code, qr_code_base64: pixMesAtual.qr_code_base64 } : null,
        assinou_contrato: Boolean(dc?.assinatura_confirmada_em),
      });
    }

    if (!mpToken || !mpPublicKey) return json({ ok: false, motivo: "pagamento_nao_configurado" }); // nao finge nada

    const { data: cliente } = await db.from("contrato_dados_cliente").select("email").eq("contrato_id", ctx.link.contrato_id).limit(1).maybeSingle();
    if (!cliente?.email) return json({ ok: false, motivo: "email_do_cliente_ausente" });

    // ---- cobrar-pix-mes (meses seguintes, assinatura Pix ja existente) ----
    if (acao === "cobrar-pix-mes") {
      if (!a) return json({ ok: false, motivo: "recorrencia_inexistente" });
      if (a.provider_subscription_id) return json({ ok: false, motivo: "esta_recorrencia_e_por_cartao" });
      const r = await cobrarPixDoMes(db, mpToken, a, cliente.email, ctx.produto.nome);
      if (!r.ok) return json(r, 400);
      return json({ ok: true, pagamento: { id: r.pagamento.id, status: r.pagamento.status, competencia: r.pagamento.competencia, valor: Number(r.pagamento.valor), qr_code: r.pagamento.qr_code, qr_code_base64: r.pagamento.qr_code_base64 } });
    }

    // ---- iniciar ----
    if (ctx.link.status !== "dados_confirmados") return json({ ok: false, motivo: "link_indisponivel" }); // contrato ja assinado nao inicia nova cobranca
    const periodicidade = body.periodicidade;
    if (periodicidade !== "mensal" && periodicidade !== "anual") return json({ error: "periodicidade deve ser 'mensal' ou 'anual'" }, 400);
    const metodo = body.metodo === "pix" ? "pix" : "cartao";

    if (a && ["ativo", "pendente", "inadimplente"].includes(a.status_financeiro)) return json({ ok: false, motivo: "recorrencia_ja_existente" });

    const valor = Number(periodicidade === "mensal" ? ctx.produto.recorrencia_valor_mensal : ctx.produto.recorrencia_valor_anual);
    if (!valor || valor <= 0) return json({ ok: false, motivo: "valor_nao_configurado" });

    const { data: contrato } = await db.from("contratos").select("contato_id").eq("id", ctx.link.contrato_id).maybeSingle();
    if (!contrato) return json({ ok: false, motivo: "link_indisponivel" });

    if (a) {
      await db.from("assinaturas_recorrentes").update({ periodicidade, valor, plano: ctx.produto.recorrencia_tipo }).eq("id", a.id);
      a = { ...a, periodicidade, valor };
    } else {
      const { data: nova, error: errIns } = await db.from("assinaturas_recorrentes").insert({
        empresa_id: ctx.link.empresa_id, contrato_id: ctx.link.contrato_id, contato_id: contrato.contato_id,
        produto_id: ctx.produto.id, periodicidade, valor, plano: ctx.produto.recorrencia_tipo,
      }).select("*").single();
      if (errIns || !nova) return json({ ok: false, motivo: "erro_interno" });
      a = nova;
    }

    if (metodo === "pix") {
      const r = await cobrarPixDoMes(db, mpToken, a!, cliente.email, ctx.produto.nome);
      if (!r.ok) return json(r, 400);
      return json({ ok: true, metodo: "pix", pagamento: { id: r.pagamento.id, status: r.pagamento.status, competencia: r.pagamento.competencia, valor: Number(r.pagamento.valor), qr_code: r.pagamento.qr_code, qr_code_base64: r.pagamento.qr_code_base64 } });
    }

    // ---- metodo === "cartao" ----
    const formData = body.formData as Row | undefined;
    if (!formData || !formData.token) return json({ error: "token do cartao ausente (Payment Brick nao tokenizou)" }, 400);

    const resp = await fetch(`${MP_API}/preapproval`, {
      method: "POST",
      headers: { Authorization: `Bearer ${mpToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        reason: `${ctx.produto.nome} (${periodicidade})`,
        external_reference: a!.id,
        payer_email: cliente.email,
        card_token_id: formData.token,
        status: "authorized",
        notification_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/mercadopago-webhook`,
        auto_recurring: {
          frequency: periodicidade === "anual" ? 12 : 1, frequency_type: "months",
          transaction_amount: valor, currency_id: "BRL",
        },
      }),
    });
    if (!resp.ok) {
      // Por padrao nunca repassa o corpo do erro (pode ecoar o e-mail). Diagnostico so com MERCADO_PAGO_DEBUG=1.
      if (Deno.env.get("MERCADO_PAGO_DEBUG") !== "1") return json({ ok: false, motivo: "falha_no_provedor" });
      let d: Row = {}; try { d = await resp.json(); } catch { /* sem corpo */ }
      return json({ ok: false, motivo: "falha_no_provedor", debug: { http: resp.status, message: d.message, error: d.error, cause: Array.isArray(d.cause) ? d.cause.map((c: Row) => ({ code: c.code, description: c.description })) : undefined } });
    }
    const mp = await resp.json();
    if (!mp.id || !mp.status) return json({ ok: false, motivo: "falha_no_provedor" });

    await db.from("assinaturas_recorrentes").update({ provider_subscription_id: String(mp.id), status_provedor: String(mp.status ?? "") }).eq("id", a!.id);
    return json({ ok: true, metodo: "cartao", status: mp.status });
  } catch (_err) {
    return json({ ok: false, motivo: "erro_interno" }, 500);
  }
});
