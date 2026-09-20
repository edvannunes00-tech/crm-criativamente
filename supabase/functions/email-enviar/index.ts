// ============================================================
// Edge Function: email-enviar  (verify_jwt = true)
// ------------------------------------------------------------
// Envio de e-mail pela caixa do CRM (replica a estrutura do CriativaBio: Resend + historico).
//  * acao "responder": responde uma mensagem da caixa (mesma conversa).
//  * acao "novo": e-mail avulso para 1..200 destinatarios; cada um recebe uma mensagem
//    enderecada so a ele (nunca lista "para"/CCO compartilhada), entao ninguem ve os demais.
// Texto digitado vira paragrafos escapados (nunca interpretado como HTML).
// Cada envio grava uma linha direction='outbound' em crm.emails.
// Sem RESEND_API_KEY/RESEND_FROM_EMAIL -> 503 (nao finge envio).
// ============================================================
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

const SITE_URL = Deno.env.get("SITE_URL") ?? "https://crm.criativamentedigital.com.br";
const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

const OUTER_BG = "#0A0A0A";
const CARD_BG = "#FFFFFF";
const CARD_INK = "#0A0A0A";
const HEADER_INK = "#F5F5F2";
const ACCENT = "#9CFF19";
const MUTED_ON_DARK = "#9A9A94";
const LINE = "#E5E7EB";

function escapeHtml(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function textoParaHtml(msg: string): string {
  return msg.split(/\n{2,}/).map((p) => `<p style="margin:0 0 12px;">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`).join("");
}
function templateAviso(preheader: string, titulo: string, corpoHtml: string, cta?: { label: string; url: string }): string {
  return `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Criativamente</title></head>
<body style="margin:0; padding:0; background:${OUTER_BG}; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <div style="display:none; max-height:0; overflow:hidden; opacity:0;">${escapeHtml(preheader)}</div>
  <div style="max-width:480px; margin:0 auto; padding:32px 16px;">
    <div style="text-align:center; padding-bottom:28px;">
      <img src="${SITE_URL}/logo.png" width="28" height="28" alt="" style="display:inline-block; vertical-align:middle; margin-right:8px;">
      <span style="font-size:18px; font-weight:700; color:${HEADER_INK}; vertical-align:middle; letter-spacing:.02em;">CRIATIVAMENTE<span style="color:${ACCENT};">.</span></span>
    </div>
    <div style="background:${CARD_BG}; border:1px solid ${LINE}; border-radius:16px; padding:36px 32px;">
      <h1 style="margin:0 0 16px; font-size:22px; line-height:1.3; color:${CARD_INK};">${escapeHtml(titulo)}</h1>
      <div style="font-size:15px; line-height:1.6; color:${CARD_INK};">${corpoHtml}</div>
      ${cta ? `<div style="text-align:center; margin:28px 0 8px;"><a href="${escapeHtml(cta.url)}" style="display:inline-block; background-color:${ACCENT}; color:#0A1400; text-decoration:none; font-weight:700; font-size:15px; padding:14px 28px; border-radius:8px;"><span style="color:#0A1400;">${escapeHtml(cta.label)}</span></a></div>
      <p style="font-size:12px; color:#6B7280; margin-top:20px; word-break:break-all;">Se o botão não funcionar, copie e cole este link no navegador:<br><a href="${escapeHtml(cta.url)}" style="color:#6B7280;">${escapeHtml(cta.url)}</a></p>` : ''}
    </div>
    <div style="text-align:center; padding-top:24px;">
      <p style="font-size:13px; color:${MUTED_ON_DARK}; margin:0;">Criativamente</p>
    </div>
  </div>
</body>
</html>`;
}

async function enviarResend(apiKey: string, from: string, to: string, subject: string, html: string): Promise<string | null> {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, html }),
  });
  if (!r.ok) throw new Error(`resend_${r.status}`); // nunca repassa o corpo (pode ecoar o destinatario)
  const d = await r.json().catch(() => ({}));
  return d?.id ? String(d.id) : null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: CORS_HEADERS });
  try {
    if (req.method !== "POST") return json({ error: "Metodo nao permitido" }, 405);
    const apiKey = Deno.env.get("RESEND_API_KEY");
    const from = Deno.env.get("RESEND_FROM_EMAIL");
    const enderecoContato = Deno.env.get("EMAIL_CONTATO") ?? "contato@criativamentedigital.com.br";
    if (!apiKey || !from) return json({ ok: false, motivo: "email_nao_configurado" }, 503);

    const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    let body: { acao?: string; email_id?: string; mensagem?: string; para?: string[]; assunto?: string; cta_label?: string; cta_url?: string; contato_id?: string };
    try { body = await req.json(); } catch { return json({ error: "Corpo invalido" }, 400); }

    const supabaseUser = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: `Bearer ${jwt}` } } });
    const { data: userData, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !userData?.user) return json({ error: "Nao autenticado" }, 401);
    const userId = userData.user.id;

    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { db: { schema: "crm" } });
    const mensagem = typeof body.mensagem === "string" ? body.mensagem.trim() : "";
    if (!mensagem || mensagem.length > 5000) return json({ error: "mensagem invalida" }, 422);

    const podeCriar = async (empresaId: string) => {
      const { data } = await db.rpc("tem_permissao", { p_usuario_id: userId, p_empresa_id: empresaId, p_modulo_chave: "email", p_acao: "criar" });
      return Boolean(data);
    };
    const contatoPorEmail = async (empresaId: string, email: string) => {
      const { data } = await db.from("contatos").select("id").eq("empresa_id", empresaId).ilike("email", email).limit(1).maybeSingle();
      return data?.id ?? null;
    };
    const gravar = async (linha: Row) => {
      const agora = new Date().toISOString();
      await db.from("emails").insert({
        direction: "outbound", from_email: enderecoContato, from_name: "Criativamente", is_read: true,
        received_at: agora, origem: "crm", ...linha,
      });
    };

    if (body.acao === "responder") {
      if (!body.email_id) return json({ error: "email_id e obrigatorio" }, 400);
      const { data: orig } = await db.from("emails").select("*").eq("id", body.email_id).maybeSingle();
      if (!orig) return json({ error: "Mensagem nao encontrada" }, 404);
      if (!(await podeCriar(orig.empresa_id))) return json({ error: "Sem permissao." }, 403);

      const destino = orig.direction === "inbound" ? orig.from_email : orig.to_email;
      if (!destino || !EMAIL_RE.test(destino)) return json({ error: "destinatario invalido" }, 422);
      const assunto = orig.subject ? (/^re:\s*/i.test(orig.subject) ? orig.subject : `Re: ${orig.subject}`) : "Re: sua mensagem";

      let idProvedor: string | null;
      try { idProvedor = await enviarResend(apiKey, from, destino, assunto, templateAviso(assunto, assunto, textoParaHtml(mensagem))); }
      catch { return json({ ok: false, motivo: "falha_no_envio" }, 502); }

      await gravar({ empresa_id: orig.empresa_id, contato_id: orig.contato_id, to_email: destino, subject: assunto, body_text: mensagem, provider_message_id: idProvedor });
      await db.from("emails").update({ replied_at: new Date().toISOString(), is_read: true }).eq("id", orig.id);
      return json({ ok: true });
    }

    if (body.acao === "novo") {
      const para = Array.isArray(body.para) ? [...new Set(body.para.map((e) => String(e).trim().toLowerCase()))] : [];
      const assunto = typeof body.assunto === "string" ? body.assunto.trim() : "";
      if (para.length < 1 || para.length > 200 || !para.every((e) => EMAIL_RE.test(e))) return json({ error: "destinatarios invalidos" }, 422);
      if (!assunto || assunto.length > 200) return json({ error: "assunto invalido" }, 422);

      const { data: vinculos } = await db.from("empresa_usuarios").select("empresa_id").eq("usuario_id", userId).eq("ativo", true);
      let empresaId: string | null = null;
      for (const v of vinculos ?? []) { if (await podeCriar(v.empresa_id)) { empresaId = v.empresa_id; break; } }
      if (!empresaId) return json({ error: "Sem permissao." }, 403);

      const html = templateAviso(assunto, assunto, textoParaHtml(mensagem));
      let enviados = 0, falhas = 0;
      for (const destino of para) {
        try {
          const idProvedor = await enviarResend(apiKey, from, destino, assunto, html);
          await gravar({ empresa_id: empresaId, contato_id: await contatoPorEmail(empresaId, destino), to_email: destino, subject: assunto, body_text: mensagem, provider_message_id: idProvedor });
          enviados++;
        } catch { falhas++; }
      }
      if (enviados === 0) return json({ ok: false, motivo: "falha_no_envio" }, 502);
      return json({ ok: true, enviados, falhas });
    }

    if (body.acao === "cta") {
      const destino = Array.isArray(body.para) ? String(body.para[0] ?? "").trim().toLowerCase() : "";
      const assunto = typeof body.assunto === "string" ? body.assunto.trim() : "";
      const label = typeof body.cta_label === "string" ? body.cta_label.trim() : "";
      const url = typeof body.cta_url === "string" ? body.cta_url.trim() : "";
      if (!EMAIL_RE.test(destino)) return json({ error: "destinatario invalido" }, 422);
      if (!assunto || assunto.length > 200 || !label || label.length > 60) return json({ error: "assunto/rotulo invalido" }, 422);
      // O botao so pode apontar para o proprio site (evita usar o envio para levar a links de terceiros).
      if (!url.startsWith(`${SITE_URL}/`)) return json({ error: "cta_url invalida" }, 422);

      const { data: vinculos } = await db.from("empresa_usuarios").select("empresa_id").eq("usuario_id", userId).eq("ativo", true);
      let empresaId: string | null = null;
      for (const v of vinculos ?? []) { if (await podeCriar(v.empresa_id)) { empresaId = v.empresa_id; break; } }
      if (!empresaId) return json({ error: "Sem permissao." }, 403);

      let idProvedor: string | null;
      try { idProvedor = await enviarResend(apiKey, from, destino, assunto, templateAviso(assunto, assunto, textoParaHtml(mensagem), { label, url })); }
      catch { return json({ ok: false, motivo: "falha_no_envio" }, 502); }
      await gravar({ empresa_id: empresaId, contato_id: body.contato_id ?? await contatoPorEmail(empresaId, destino), to_email: destino, subject: assunto, body_text: `${mensagem}\n\n[Botão: ${label}]`, provider_message_id: idProvedor });
      return json({ ok: true });
    }

    return json({ error: "acao deve ser 'responder', 'novo' ou 'cta'" }, 400);
  } catch (_e) {
    return json({ ok: false, motivo: "erro_interno" }, 500);
  }
});
