// ============================================================
// Edge Function: convidar-usuario
// ------------------------------------------------------------
// Recebe { email, papel_id, empresa_id } de um usuario ja autenticado
// no CRM, confere (no banco, via crm.tem_permissao) se ele pode
// administrar usuarios, e so entao dispara o convite oficial do
// Supabase Auth (que manda o e-mail e deixa a pessoa criar a
// propria senha no primeiro acesso).
//
// A service_role key SO existe aqui dentro (variavel de ambiente
// da propria Edge Function) -- nunca chega ao navegador.
// ============================================================

import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  // O gateway do Supabase deixa o preflight (OPTIONS) passar sem exigir
  // Authorization, mas o navegador so manda o POST de verdade depois de
  // receber os headers de CORS nesta resposta -- sem isso, a chamada real
  // nunca sai do navegador (falha silenciosa, sem corpo de erro util).
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: CORS_HEADERS });

  try {
    if (req.method !== "POST") {
      return jsonResponse({ error: "Metodo nao permitido" }, 405);
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace("Bearer ", "");

    const { email, papel_id, empresa_id } = await req.json();

    if (!email || !papel_id || !empresa_id) {
      return jsonResponse({ error: "email, papel_id e empresa_id sao obrigatorios" }, 400);
    }

    // Cliente "do usuario" (respeita RLS) -- usado so para confirmar
    // quem esta chamando.
    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: `Bearer ${jwt}` } } }
    );

    const { data: userData, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !userData?.user) {
      return jsonResponse({ error: "Nao autenticado" }, 401);
    }

    // Cliente admin (service_role), apontando pro schema crm --
    // so usado DEPOIS de confirmar autenticacao e permissao.
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { db: { schema: "crm" } }
    );

    const { data: podeAdministrar, error: permError } = await supabaseAdmin.rpc(
      "tem_permissao",
      {
        p_usuario_id: userData.user.id,
        p_empresa_id: empresa_id,
        p_modulo_chave: "usuarios",
        p_acao: "administrar",
      }
    );

    if (permError || !podeAdministrar) {
      return jsonResponse({ error: "Sem permissao para convidar usuarios." }, 403);
    }

    // Dispara o convite oficial do Supabase Auth (envia e-mail real,
    // usa o client admin de auth, que nao depende do schema acima)
    const { data: inviteData, error: inviteError } =
      await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        data: { convite_papel_id: papel_id, convite_empresa_id: empresa_id },
      });

    if (inviteError) {
      return jsonResponse({ error: inviteError.message }, 400);
    }

    // Registra o convite na tabela de acompanhamento (schema crm)
    await supabaseAdmin.from("convites_usuario").insert({
      empresa_id,
      email,
      papel_id,
      convidado_por: userData.user.id,
    });

    return jsonResponse({ success: true, user: inviteData.user }, 200);
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});
