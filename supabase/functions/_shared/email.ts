// Codigo de e-mail compartilhado entre as Edge Functions (template Criativamente + envio Resend).
// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

export const SITE_URL = Deno.env.get("SITE_URL") ?? "https://crm.criativamentedigital.com.br";
export const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

const OUTER_BG = "#0A0A0A";
const CARD_BG = "#FFFFFF";
const CARD_INK = "#0A0A0A";
const HEADER_INK = "#F5F5F2";
const ACCENT = "#9CFF19";
const MUTED_ON_DARK = "#9A9A94";
const LINE = "#E5E7EB";

export function escapeHtml(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
// Texto -> HTML seguro. Primeiro ESCAPA tudo; depois so aplica marcadores simples:
// **negrito**, *italico*, [texto](https://...), linhas "- item" viram lista. Nada digitado vira HTML.
export function inlineRico(escapado: string): string {
  return escapado
    .replace(/\[([^\]\n]{1,200})\]\((https?:\/\/[^\s)"<]{1,500}|mailto:[^\s)"<]{1,200})\)/g, (_m, t, u) => `<a href="${u}" style="color:#0A7A2F;">${t}</a>`)
    .replace(/\*\*([^*\n]{1,300})\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[\s(])\*([^*\n]{1,300})\*(?=[\s).,;:!?]|$)/g, "$1<em>$2</em>");
}
export function textoParaHtml(msg: string): string {
  return msg.split(/\n{2,}/).map((bloco) => {
    const linhas = bloco.split("\n");
    if (linhas.length > 0 && linhas.every((l) => /^\s*[-•]\s+/.test(l))) {
      return `<ul style="margin:0 0 12px; padding-left:20px;">${linhas.map((l) => `<li>${inlineRico(escapeHtml(l.replace(/^\s*[-•]\s+/, "")))}</li>`).join("")}</ul>`;
    }
    return `<p style="margin:0 0 12px;">${linhas.map((l) => inlineRico(escapeHtml(l))).join("<br>")}</p>`;
  }).join("");
}
export function templateAviso(preheader: string, titulo: string, corpoHtml: string, cta?: { label: string; url: string }): string {
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

export interface OpcoesEnvio { cc?: string[]; bcc?: string[]; anexos?: { filename: string; base64: string }[] }
export async function enviarResend(apiKey: string, from: string, to: string | string[], subject: string, html: string, op: OpcoesEnvio = {}): Promise<string | null> {
  const corpo: Row = { from, to, subject, html };
  if (op.cc?.length) corpo.cc = op.cc;
  if (op.bcc?.length) corpo.bcc = op.bcc;
  if (op.anexos?.length) corpo.attachments = op.anexos.map((a) => ({ filename: a.filename, content: a.base64 }));
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
  if (!r.ok) throw new Error(`resend_${r.status}`); // nunca repassa o corpo (pode ecoar o destinatario)
  const d = await r.json().catch(() => ({}));
  return d?.id ? String(d.id) : null;
}

