// ============================================================
// Edge Function: contrato-revogar-link
// ------------------------------------------------------------
// Revoga manualmente um link de preenchimento (equipe do CRM).
// So afeta links em status 'ativo' -- a transicao unidirecional
// real e garantida pelo trigger crm.trg_before_contrato_link no
// banco; esta function so orienta o UPDATE e trata "0 linhas
// afetadas" como "link ja nao estava mais ativo".
//
// CORS: mesmo motivo de contrato-gerar-link -- chamada cross-origin
// do navegador com JSON dispara preflight OPTIONS, que precisa de
// resposta com os headers certos ou o browser bloqueia a chamada real.
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
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: CORS_HEADERS });
  }

  try {
    if (req.method !== "POST") {
      return jsonResponse({ error: "Metodo nao permitido" }, 405);
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace("Bearer ", "");

    let body: { link_id?: string; motivo_revogacao?: string };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Corpo da requisicao invalido" }, 400);
    }

    const { link_id, motivo_revogacao } = body;
    if (!link_id || typeof link_id !== "string") {
      return jsonResponse({ error: "link_id e obrigatorio" }, 400);
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

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { db: { schema: "crm" } }
    );

    const { data: link, error: linkError } = await supabaseAdmin
      .from("contrato_links")
      .select("id, empresa_id, contrato_id, status")
      .eq("id", link_id)
      .maybeSingle();

    if (linkError || !link) {
      return jsonResponse({ error: "Link nao encontrado" }, 404);
    }

    const { data: podeEditar, error: permError } = await supabaseAdmin.rpc("tem_permissao", {
      p_usuario_id: userData.user.id,
      p_empresa_id: link.empresa_id,
      p_modulo_chave: "contratos",
      p_acao: "editar",
    });

    if (permError || !podeEditar) {
      return jsonResponse({ error: "Sem permissao para revogar este link." }, 403);
    }

    // So afeta a linha se AINDA estiver 'ativo' -- verificacao atomica
    // no proprio WHERE, sem depender de checar o status antes e torcer
    // pra ninguem mudar entre a leitura e a escrita.
    const { data: atualizado, error: updateError } = await supabaseAdmin
      .from("contrato_links")
      .update({
        status: "revogado",
        revoked_at: new Date().toISOString(),
        revoked_by: userData.user.id,
        motivo_revogacao: motivo_revogacao ?? null,
      })
      .eq("id", link_id)
      .eq("status", "ativo")
      .select("id")
      .maybeSingle();

    if (updateError) {
      return jsonResponse({ error: "Falha ao revogar o link." }, 500);
    }

    if (!atualizado) {
      return jsonResponse(
        { error: "Este link ja nao esta mais ativo (confirmado, expirado ou ja revogado)." },
        409
      );
    }

    const { error: atividadeError } = await supabaseAdmin.from("atividades").insert({
      empresa_id: link.empresa_id,
      contrato_id: link.contrato_id,
      tipo: "link_revogado",
      titulo: "Link de preenchimento revogado",
      usuario_id: userData.user.id,
      descricao: motivo_revogacao ?? null,
    });
    if (atividadeError) console.error("Falha ao registrar atividade link_revogado:", atividadeError);

    return jsonResponse({ ok: true }, 200);
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});
