// ============================================================
// Edge Function: contrato-abrir-link  (verify_jwt = true)
// ------------------------------------------------------------
// Devolve o token de um link ainda em andamento (ativo / dados_confirmados) para o CRM abrir
// ou copiar sem precisar gerar outro. O token fica guardado CIFRADO (AES-GCM, chave em secret)
// e so e decifrado aqui, para usuario autenticado com permissao de editar contratos.
// Links antigos (criados antes desta funcionalidade) nao tem token guardado.
// ============================================================
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });

async function decifrar(b64: string): Promise<string | null> {
  const chaveB64 = Deno.env.get("LINK_TOKEN_KEY");
  if (!chaveB64) return null;
  const raw = Uint8Array.from(atob(chaveB64), (c) => c.charCodeAt(0));
  const chave = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]);
  const tudo = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  try {
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: tudo.slice(0, 12) }, chave, tudo.slice(12));
    return new TextDecoder().decode(pt);
  } catch { return null; }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: CORS_HEADERS });
  try {
    if (req.method !== "POST") return json({ error: "Metodo nao permitido" }, 405);
    const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    let body: { link_id?: string };
    try { body = await req.json(); } catch { return json({ error: "Corpo invalido" }, 400); }
    if (!body.link_id) return json({ error: "link_id e obrigatorio" }, 400);

    const supabaseUser = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: `Bearer ${jwt}` } } });
    const { data: userData, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !userData?.user) return json({ error: "Nao autenticado" }, 401);

    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { db: { schema: "crm" } });
    const { data: link } = await db.from("contrato_links").select("id, empresa_id, status, expires_at, token_cifrado").eq("id", body.link_id).maybeSingle();
    if (!link) return json({ error: "Link nao encontrado" }, 404);

    const { data: pode } = await db.rpc("tem_permissao", { p_usuario_id: userData.user.id, p_empresa_id: link.empresa_id, p_modulo_chave: "contratos", p_acao: "editar" });
    if (!pode) return json({ error: "Sem permissao." }, 403);

    if (!["ativo", "dados_confirmados"].includes(link.status) || new Date(link.expires_at) <= new Date()) {
      return json({ ok: false, motivo: "link_encerrado", error: "Este link nao esta mais em andamento." }, 409);
    }
    if (!link.token_cifrado) {
      return json({ ok: false, motivo: "token_nao_guardado", error: "Este link foi criado antes do recurso de reabrir. Gere um novo link (o anterior sera revogado)." }, 409);
    }
    const token = await decifrar(link.token_cifrado);
    if (!token) return json({ ok: false, motivo: "falha_ao_decifrar", error: "Nao foi possivel recuperar este link." }, 500);
    return json({ ok: true, token });
  } catch (_e) {
    return json({ ok: false, motivo: "erro_interno" }, 500);
  }
});
