// ============================================================
// Edge Function: google-oauth-callback (v2 - com checagem clara de segredos)
// ============================================================

import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: CORS_HEADERS });
  }

  try {
    if (req.method !== "POST") {
      return jsonResponse({ error: "Metodo nao permitido" }, 405);
    }

    // Checagem explicita dos segredos ANTES de qualquer chamada de rede --
    // se faltar algum, o erro fica claro em vez de um 500 generico.
    const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
    const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
    if (!clientId || !clientSecret) {
      return jsonResponse({ error: "Configuracao incompleta no servidor: faltam GOOGLE_CLIENT_ID e/ou GOOGLE_CLIENT_SECRET nos secrets da Edge Function." }, 500);
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace("Bearer ", "");
    const { code, redirect_uri, empresa_id } = await req.json();

    if (!code || !redirect_uri || !empresa_id) {
      return jsonResponse({ error: "code, redirect_uri e empresa_id sao obrigatorios" }, 400);
    }

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: `Bearer ${jwt}` } } }
    );
    const { data: userData, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !userData?.user) {
      return jsonResponse({ error: "Nao autenticado" }, 401);
    }

    const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: String(code),
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: String(redirect_uri),
        grant_type: "authorization_code",
      }),
    });

    const tokenData = await tokenResp.json();
    if (!tokenResp.ok || !tokenData.refresh_token) {
      return jsonResponse({ error: tokenData.error_description || tokenData.error || "Nao foi possivel obter o token do Google (o codigo pode ter expirado -- tente conectar de novo do zero)." }, 400);
    }

    const perfilResp = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const perfil = await perfilResp.json();

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { db: { schema: "crm" } }
    );

    const { error: upsertError } = await supabaseAdmin.from("integracoes_google").upsert(
      {
        usuario_id: userData.user.id,
        empresa_id,
        refresh_token: tokenData.refresh_token,
        email_google: perfil.email || null,
        conectado_em: new Date().toISOString(),
      },
      { onConflict: "usuario_id,empresa_id" }
    );

    if (upsertError) {
      return jsonResponse({ error: `Erro ao salvar no banco: ${upsertError.message}` }, 500);
    }

    return jsonResponse({ success: true, email: perfil.email || null }, 200);
  } catch (err) {
    return jsonResponse({ error: `Erro inesperado: ${String(err)}` }, 500);
  }
});
