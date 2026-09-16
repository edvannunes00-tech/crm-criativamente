// ============================================================
// Edge Function: contrato-gerar-link
// ------------------------------------------------------------
// Gera um link publico seguro de preenchimento para um contrato.
// So o CRM autenticado chama isso (verify_jwt liga a checagem de
// JWT no gateway do Supabase; mesmo assim confirmamos de novo aqui,
// igual ao padrao ja usado em convidar-usuario).
//
// O token cru so existe nesta resposta -- so o hash (sha-256) e
// gravado em crm.contrato_links.
// ============================================================

import { createClient } from "jsr:@supabase/supabase-js@2";

const DIAS_VALIDADE_PADRAO = 7;
const DIAS_VALIDADE_MAXIMO = 30;

const STATUS_CONTRATO_BLOQUEADOS = ["assinado", "validado", "cancelado"];

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function gerarTokenBase64Url(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256Hex(texto: string): Promise<string> {
  const dados = new TextEncoder().encode(texto);
  const hashBuffer = await crypto.subtle.digest("SHA-256", dados);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req: Request) => {
  try {
    if (req.method !== "POST") {
      return jsonResponse({ error: "Metodo nao permitido" }, 405);
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace("Bearer ", "");

    let body: { contrato_id?: string; dias_validade?: number };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Corpo da requisicao invalido" }, 400);
    }

    const { contrato_id } = body;
    if (!contrato_id || typeof contrato_id !== "string") {
      return jsonResponse({ error: "contrato_id e obrigatorio" }, 400);
    }

    let diasValidade = body.dias_validade ?? DIAS_VALIDADE_PADRAO;
    if (typeof diasValidade !== "number" || !Number.isFinite(diasValidade) || diasValidade <= 0) {
      return jsonResponse({ error: "dias_validade deve ser um numero positivo" }, 400);
    }
    if (diasValidade > DIAS_VALIDADE_MAXIMO) {
      return jsonResponse({ error: `dias_validade nao pode exceder ${DIAS_VALIDADE_MAXIMO}` }, 400);
    }

    // Cliente "do usuario" (respeita RLS) -- so pra confirmar quem chama.
    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: `Bearer ${jwt}` } } }
    );

    const { data: userData, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !userData?.user) {
      return jsonResponse({ error: "Nao autenticado" }, 401);
    }

    // Cliente admin (service_role), schema crm -- so usado depois de
    // confirmar autenticacao e permissao.
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { db: { schema: "crm" } }
    );

    const { data: contrato, error: contratoError } = await supabaseAdmin
      .from("contratos")
      .select("id, empresa_id, status")
      .eq("id", contrato_id)
      .maybeSingle();

    if (contratoError || !contrato) {
      return jsonResponse({ error: "Contrato nao encontrado" }, 404);
    }

    const { data: podeCriar, error: permError } = await supabaseAdmin.rpc("tem_permissao", {
      p_usuario_id: userData.user.id,
      p_empresa_id: contrato.empresa_id,
      p_modulo_chave: "contratos",
      p_acao: "criar",
    });

    if (permError || !podeCriar) {
      return jsonResponse({ error: "Sem permissao para gerar link deste contrato." }, 403);
    }

    if (STATUS_CONTRATO_BLOQUEADOS.includes(contrato.status)) {
      return jsonResponse(
        { error: "Este contrato ja foi finalizado e nao aceita novo link de preenchimento." },
        409
      );
    }

    const token = gerarTokenBase64Url();
    const tokenHash = await sha256Hex(token);
    const expiresAt = new Date(Date.now() + diasValidade * 24 * 60 * 60 * 1000).toISOString();

    const { data: link, error: insertError } = await supabaseAdmin
      .from("contrato_links")
      .insert({
        empresa_id: contrato.empresa_id,
        contrato_id: contrato.id,
        token_hash: tokenHash,
        expires_at: expiresAt,
        created_by: userData.user.id,
      })
      .select("id, expires_at")
      .single();

    if (insertError || !link) {
      return jsonResponse({ error: "Falha ao criar o link." }, 500);
    }

    await supabaseAdmin.from("atividades").insert({
      empresa_id: contrato.empresa_id,
      contrato_id: contrato.id,
      tipo: "link_criado",
      titulo: "Link de preenchimento gerado",
      usuario_id: userData.user.id,
    });

    return jsonResponse(
      {
        link_id: link.id,
        token,
        expires_at: link.expires_at,
      },
      200
    );
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});
