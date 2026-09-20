// ============================================================
// Edge Function: email-entrada  (verify_jwt = false; autenticidade = segredo compartilhado)
// ------------------------------------------------------------
// Recebe e-mails enviados a contato@criativamentedigital.com.br, entregues pelo Cloudflare Email
// Worker (workers/email-entrada) ja interpretados (postal-mime). Guarda em crm.emails
// (direction='inbound'), vincula ao contato pelo e-mail do remetente (conveniencia, nao seguranca)
// e salva anexos (ate 8 MB cada, max 5) no Storage privado. Idempotente por Message-ID.
// ============================================================
import { createClient } from "jsr:@supabase/supabase-js@2";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const MAX_BODY = 20000;
const ANEXO_MAX = 8 * 1024 * 1024;
const ANEXOS_MAX = 5;

function iguais(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Metodo nao permitido" }, 405);
  const segredo = Deno.env.get("EMAIL_ENTRADA_SECRET");
  if (!segredo) return json({ ok: false, motivo: "nao_configurado" }, 503);
  if (!iguais(req.headers.get("x-email-secret") ?? "", segredo)) return json({ error: "nao autorizado" }, 401);

  // deno-lint-ignore no-explicit-any
  let b: any;
  try { b = await req.json(); } catch { return json({ error: "Corpo invalido" }, 400); }
  const fromEmail = String(b.from_email ?? "").trim().toLowerCase();
  if (!fromEmail) return json({ error: "from_email obrigatorio" }, 400);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { db: { schema: "crm" } });
  const { data: empresa } = await db.from("empresas").select("id").order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (!empresa) return json({ error: "sem empresa" }, 500);
  const empresaId = empresa.id as string;

  const messageId = b.message_id ? String(b.message_id).slice(0, 300) : null;
  if (messageId) {
    const { data: ja } = await db.from("emails").select("id").eq("empresa_id", empresaId).eq("message_id_header", messageId).maybeSingle();
    if (ja) return json({ ok: true, duplicado: true });
  }

  const { data: contato } = await db.from("contatos").select("id").eq("empresa_id", empresaId).ilike("email", fromEmail).limit(1).maybeSingle();
  const id = crypto.randomUUID();
  const anexos: { filename: string; mimeType: string; size: number; path: string }[] = [];
  const lista = Array.isArray(b.attachments) ? b.attachments.slice(0, ANEXOS_MAX) : [];
  for (const a of lista) {
    try {
      const bytes = Uint8Array.from(atob(String(a.base64 ?? "")), (c) => c.charCodeAt(0));
      if (bytes.length === 0 || bytes.length > ANEXO_MAX) continue;
      const nome = String(a.filename ?? "anexo").replace(/[^\w.\- ]/g, "_").slice(0, 120) || "anexo";
      const path = `${empresaId}/emails/${id}/${crypto.randomUUID()}-${nome}`;
      const { error } = await db.storage.from("documentos-internos").upload(path, bytes, { contentType: String(a.mime ?? "application/octet-stream"), upsert: false });
      if (!error) anexos.push({ filename: nome, mimeType: String(a.mime ?? "application/octet-stream"), size: bytes.length, path });
    } catch { /* anexo invalido: ignora */ }
  }

  const corpo = String(b.text || b.html || "(sem conteudo)").slice(0, MAX_BODY);
  const { error } = await db.from("emails").insert({
    id, empresa_id: empresaId, contato_id: contato?.id ?? null, direction: "inbound",
    from_email: fromEmail, from_name: b.from_name ? String(b.from_name).slice(0, 200) : null,
    to_email: b.to ? String(b.to).slice(0, 200) : null, subject: b.subject ? String(b.subject).slice(0, 300) : null,
    body_text: corpo, is_read: false, anexos, message_id_header: messageId, origem: "cloudflare",
  });
  if (error) return json({ ok: false, motivo: "erro_ao_gravar" }, 500);
  return json({ ok: true });
});
