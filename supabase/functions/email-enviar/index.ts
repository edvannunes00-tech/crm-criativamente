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

import { SITE_URL, EMAIL_RE, escapeHtml, textoParaHtml, templateAviso, enviarResend } from "../_shared/email.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: CORS_HEADERS });
  try {
    if (req.method !== "POST") return json({ error: "Metodo nao permitido" }, 405);
    const apiKey = Deno.env.get("RESEND_API_KEY");
    const from = Deno.env.get("RESEND_FROM_EMAIL");
    const enderecoContato = Deno.env.get("EMAIL_CONTATO") ?? "contato@criativamentedigital.com.br";
    if (!apiKey || !from) return json({ ok: false, motivo: "email_nao_configurado" }, 503);

    const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    let body: { acao?: string; email_id?: string; mensagem?: string; para?: string[]; cc?: string[]; cco?: string[]; individual?: boolean; anexos?: { filename?: string; mime?: string; base64?: string }[]; assunto?: string; cta_label?: string; cta_url?: string; contato_id?: string };
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
      const limpar = (v: unknown) => (Array.isArray(v) ? [...new Set(v.map((e) => String(e).trim().toLowerCase()).filter(Boolean))] : []);
      const para = limpar(body.para); const cc = limpar(body.cc); const cco = limpar(body.cco);
      const assunto = typeof body.assunto === "string" ? body.assunto.trim() : "";
      const individual = body.individual === true;
      const todos = [...para, ...cc, ...cco];
      if (para.length < 1 || todos.length > 200 || !todos.every((e) => EMAIL_RE.test(e))) return json({ error: "destinatarios invalidos" }, 422);
      if (!assunto || assunto.length > 200) return json({ error: "assunto invalido" }, 422);

      // Anexos: ate 5 arquivos, 6 MB no total (limite do corpo da requisicao).
      const anexosEntrada = Array.isArray(body.anexos) ? body.anexos.slice(0, 5) : [];
      const anexos: { filename: string; mime: string; base64: string; bytes: Uint8Array }[] = [];
      let total = 0;
      for (const a of anexosEntrada) {
        try {
          const bytes = Uint8Array.from(atob(String(a.base64 ?? "")), (c) => c.charCodeAt(0));
          total += bytes.length;
          if (bytes.length === 0 || total > 6 * 1024 * 1024) return json({ error: "anexos muito grandes (maximo 6 MB no total)" }, 422);
          anexos.push({ filename: String(a.filename ?? "anexo").replace(/[^\w.\- ]/g, "_").slice(0, 120) || "anexo", mime: String(a.mime ?? "application/octet-stream"), base64: String(a.base64), bytes });
        } catch { return json({ error: "anexo invalido" }, 422); }
      }

      const { data: vinculos } = await db.from("empresa_usuarios").select("empresa_id").eq("usuario_id", userId).eq("ativo", true);
      let empresaId: string | null = null;
      for (const v of vinculos ?? []) { if (await podeCriar(v.empresa_id)) { empresaId = v.empresa_id; break; } }
      if (!empresaId) return json({ error: "Sem permissao." }, 403);

      const salvarAnexos = async (id: string) => {
        const lista: { filename: string; mimeType: string; size: number; path: string }[] = [];
        for (const a of anexos) {
          const path = `${empresaId}/emails/${id}/${crypto.randomUUID()}-${a.filename}`;
          const { error } = await db.storage.from("documentos-internos").upload(path, a.bytes, { contentType: a.mime, upsert: false });
          if (!error) lista.push({ filename: a.filename, mimeType: a.mime, size: a.bytes.length, path });
        }
        return lista;
      };
      const html = templateAviso(assunto, assunto, textoParaHtml(mensagem));
      const anexosEnvio = anexos.map((a) => ({ filename: a.filename, base64: a.base64 }));

      if (!individual) {
        // Uma unica mensagem, como no Gmail: Para / Cc / Cco (Cco nao aparece para os demais).
        try {
          const idProvedor = await enviarResend(apiKey, from, para, assunto, html, { cc, bcc: cco, anexos: anexosEnvio });
          const id = crypto.randomUUID();
          await gravar({ id, empresa_id: empresaId, contato_id: await contatoPorEmail(empresaId, para[0]), to_email: para.join(", "), cc_email: cc.join(", ") || null, bcc_email: cco.join(", ") || null, subject: assunto, body_text: mensagem, provider_message_id: idProvedor, anexos: await salvarAnexos(id) });
        } catch { return json({ ok: false, motivo: "falha_no_envio" }, 502); }
        return json({ ok: true, enviados: todos.length, falhas: 0 });
      }

      // Envio individual: cada destinatario recebe uma copia so para ele (ninguem ve os outros).
      let enviados = 0, falhas = 0;
      for (const destino of todos) {
        try {
          const idProvedor = await enviarResend(apiKey, from, destino, assunto, html, { anexos: anexosEnvio });
          const id = crypto.randomUUID();
          await gravar({ id, empresa_id: empresaId, contato_id: await contatoPorEmail(empresaId, destino), to_email: destino, subject: assunto, body_text: mensagem, provider_message_id: idProvedor, anexos: await salvarAnexos(id) });
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
