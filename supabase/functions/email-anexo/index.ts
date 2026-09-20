// ============================================================
// Edge Function: email-anexo  (verify_jwt = true)
// Devolve uma URL assinada (5 min) para baixar um anexo da caixa de e-mail.
// Exige permissao email/visualizar na empresa do e-mail. O caminho nunca vai ao navegador.
// ============================================================
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: CORS_HEADERS });
  try {
    if (req.method !== "POST") return json({ error: "Metodo nao permitido" }, 405);
    const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    let body: { email_id?: string; indice?: number };
    try { body = await req.json(); } catch { return json({ error: "Corpo invalido" }, 400); }
    if (!body.email_id || typeof body.indice !== "number") return json({ error: "parametros invalidos" }, 400);

    const supabaseUser = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: `Bearer ${jwt}` } } });
    const { data: userData, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !userData?.user) return json({ error: "Nao autenticado" }, 401);

    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { db: { schema: "crm" } });
    const { data: em } = await db.from("emails").select("empresa_id, anexos").eq("id", body.email_id).maybeSingle();
    if (!em) return json({ error: "Nao encontrado" }, 404);
    const { data: pode } = await db.rpc("tem_permissao", { p_usuario_id: userData.user.id, p_empresa_id: em.empresa_id, p_modulo_chave: "email", p_acao: "visualizar" });
    if (!pode) return json({ error: "Sem permissao." }, 403);

    const anexo = Array.isArray(em.anexos) ? em.anexos[body.indice] : null;
    if (!anexo?.path) return json({ error: "Anexo nao encontrado" }, 404);
    const { data: url } = await db.storage.from("documentos-internos").createSignedUrl(anexo.path, 300, { download: anexo.filename });
    if (!url) return json({ error: "Falha ao gerar o link" }, 500);
    return json({ ok: true, url: url.signedUrl });
  } catch (_e) {
    return json({ ok: false, motivo: "erro_interno" }, 500);
  }
});
