// ============================================================
// Edge Function: recorrencia-checkout  (publica; autenticacao = token do link)
// ------------------------------------------------------------
// acao "iniciar": cria a assinatura recorrente (Preapproval do Mercado Pago) JA
//   autorizada com o token de cartao que o Payment Brick tokenizou na propria
//   pagina publica do contrato (embutido, sem redirecionar pro Mercado Pago --
//   mesmo padrao ja validado no sinal avulso, no Agenda.Criativamente e no
//   CriativaBio). Valor e periodicidade vem do CATALOGO no servidor, nunca do
//   navegador. Nenhum dado de cartao passa por aqui, so o token de uso unico.
// acao "status": devolve o estado financeiro real. Se a assinatura ainda aguarda
//   confirmacao, consulta a API oficial do provedor e aplica o resultado (nao
//   confia no navegador; nao marca nada como pago por conta propria).
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: CORS_HEADERS });
  try {
    if (req.method !== "POST") return json({ error: "Metodo nao permitido" }, 405);
    let body: Row;
    try { body = await req.json(); } catch { return json({ error: "Corpo invalido" }, 400); }
    const acao = body.acao;
    if (!["config", "status", "iniciar"].includes(acao)) return json({ error: "acao deve ser 'config', 'status' ou 'iniciar'" }, 400);

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
      const { data: dc } = await db.from("contrato_dados_cliente").select("assinatura_confirmada_em").eq("contrato_id", ctx.link.contrato_id).limit(1).maybeSingle();
      return json({
        ok: true,
        configurado: Boolean(mpToken && mpPublicKey),
        valores: { mensal: ctx.produto.recorrencia_valor_mensal, anual: ctx.produto.recorrencia_valor_anual },
        assinatura: a ? { periodicidade: a.periodicidade, valor: a.valor, status_financeiro: a.status_financeiro, proxima_cobranca_em: a.proxima_cobranca_em } : null,
        assinou_contrato: Boolean(dc?.assinatura_confirmada_em),
      });
    }

    // ---- iniciar ----
    if (ctx.link.status !== "dados_confirmados") return json({ ok: false, motivo: "link_indisponivel" }); // contrato ja assinado nao inicia nova cobranca
    const periodicidade = body.periodicidade;
    if (periodicidade !== "mensal" && periodicidade !== "anual") return json({ error: "periodicidade deve ser 'mensal' ou 'anual'" }, 400);
    if (!mpToken || !mpPublicKey) return json({ ok: false, motivo: "pagamento_nao_configurado" }); // nao finge nada

    const formData = body.formData as Row | undefined;
    if (!formData || !formData.token) return json({ error: "token do cartao ausente (Payment Brick nao tokenizou)" }, 400);

    if (a && ["ativo", "pendente", "inadimplente"].includes(a.status_financeiro)) return json({ ok: false, motivo: "recorrencia_ja_existente" });

    const valor = Number(periodicidade === "mensal" ? ctx.produto.recorrencia_valor_mensal : ctx.produto.recorrencia_valor_anual);
    if (!valor || valor <= 0) return json({ ok: false, motivo: "valor_nao_configurado" });

    const { data: cliente } = await db.from("contrato_dados_cliente").select("email").eq("contrato_id", ctx.link.contrato_id).limit(1).maybeSingle();
    if (!cliente?.email) return json({ ok: false, motivo: "email_do_cliente_ausente" });
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
    return json({ ok: true, status: mp.status });
  } catch (_err) {
    return json({ ok: false, motivo: "erro_interno" }, 500);
  }
});
