// ============================================================
// Edge Function: contrato-gerar-link
// ------------------------------------------------------------
// Gera um link publico seguro de preenchimento para um contrato.
// So o CRM autenticado chama isso -- verify_jwt liga a checagem de
// JWT no gateway do Supabase pra POST/GET, mas o gateway deixa OPTIONS
// (preflight de CORS) passar sem exigir Authorization; por isso a
// function precisa responder o preflight ela mesma, com os headers de
// CORS corretos, senao o navegador bloqueia a chamada real antes de
// envia-la (a chamada nunca chega a errar por auth -- o browser nem
// tenta). Mesmo padrao ja usado em contrato-publico/contrato-segunda-via.
//
// O token cru so existe nesta resposta -- so o hash (sha-256) e
// gravado em crm.contrato_links.
// ============================================================

import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DIAS_VALIDADE_PADRAO = 7;
const DIAS_VALIDADE_MAXIMO = 30;

const STATUS_CONTRATO_BLOQUEADOS = ["assinado", "validado", "cancelado"];

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
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

// Guarda o token de forma criptografada (AES-GCM) para o CRM poder reabrir/copiar o link depois.
// So a funcao contrato-abrir-link (autenticada) consegue decifrar. Sem chave configurada, nao guarda.
async function cifrarToken(token: string): Promise<string | null> {
  const chaveB64 = Deno.env.get("LINK_TOKEN_KEY");
  if (!chaveB64) return null;
  const raw = Uint8Array.from(atob(chaveB64), (c) => c.charCodeAt(0));
  const chave = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, chave, new TextEncoder().encode(token)));
  const tudo = new Uint8Array(iv.length + ct.length);
  tudo.set(iv); tudo.set(ct, iv.length);
  let bin = ""; for (const b of tudo) bin += String.fromCharCode(b);
  return btoa(bin);
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

    let body: { contrato_id?: string; dias_validade?: number; confirmar_revogacao?: boolean };
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

    // Um novo link SUBSTITUI o anterior. Se o cliente ja assinou (ou ja pagou), so quem tem
    // permissao de administrar pode gerar outro, e so com confirmacao explicita.
    const { data: existentes } = await supabaseAdmin
      .from("contrato_links").select("id, status").eq("contrato_id", contrato.id).in("status", ["ativo", "dados_confirmados", "confirmado"]);
    const abertos = (existentes ?? []).filter((l) => l.status === "ativo" || l.status === "dados_confirmados");
    const { data: assinou } = await supabaseAdmin
      .from("contrato_dados_cliente").select("id").eq("contrato_id", contrato.id).not("assinatura_confirmada_em", "is", null).limit(1);
    const { data: pagando } = await supabaseAdmin
      .from("assinaturas_recorrentes").select("id").eq("contrato_id", contrato.id).in("status_financeiro", ["ativo", "pendente", "inadimplente"]).limit(1);
    const jaAssinado = (assinou ?? []).length > 0 || (existentes ?? []).some((l) => l.status === "confirmado");
    const jaPagando = (pagando ?? []).length > 0;

    if (jaAssinado || jaPagando) {
      const { data: ehAdmin } = await supabaseAdmin.rpc("tem_permissao", {
        p_usuario_id: userData.user.id, p_empresa_id: contrato.empresa_id, p_modulo_chave: "contratos", p_acao: "administrar",
      });
      if (!ehAdmin) {
        return jsonResponse({
          error: jaAssinado
            ? "Este contrato ja foi assinado pelo cliente. Somente um administrador pode gerar um novo link."
            : "Ja existe pagamento recorrente ativo neste contrato. Somente um administrador pode gerar um novo link.",
          motivo: "somente_admin",
        }, 403);
      }
      if (!body.confirmar_revogacao) {
        return jsonResponse({
          error: "Contrato ja assinado ou com pagamento ativo: um novo link cria outro processo e pode afetar o contrato e a prestacao de servico.",
          motivo: jaAssinado ? "contrato_ja_assinado" : "pagamento_ativo",
        }, 409);
      }
    } else if (abertos.length > 0 && !body.confirmar_revogacao) {
      return jsonResponse({
        error: "Ja existe um link em andamento. Gerar um novo link revoga o anterior.",
        motivo: "revoga_anterior",
      }, 409);
    }

    // Assinatura da CONTRATADA: registrada no contrato ao gerar o link (uma vez; nao muda depois).
    const { data: regContratada } = await supabaseAdmin.from("contratos").select("contratada_assinada_em").eq("id", contrato.id).maybeSingle();
    let assinaturaBytes: Uint8Array | null = null;
    let snapshotContratada: Record<string, string | null> | null = null;
    if (!regContratada?.contratada_assinada_em) {
      const { data: fiscalRow } = await supabaseAdmin.from("configuracoes").select("valor").eq("empresa_id", contrato.empresa_id).eq("chave", "dados_fiscais_contratada").maybeSingle();
      const { data: empRow } = await supabaseAdmin.from("empresas").select("nome").eq("id", contrato.empresa_id).maybeSingle();
      const fiscal = (fiscalRow?.valor as Record<string, string | null>) ?? {};
      const png = typeof fiscal.assinatura_png === "string" ? fiscal.assinatura_png.replace(/^data:image\/png;base64,/, "") : "";
      if (!png) {
        return jsonResponse({
          error: "Cadastre a assinatura da contratada (aba Documento, Dados da contratada, Editar) antes de gerar o link. Ela fica registrada no contrato e nao muda depois.",
          motivo: "assinatura_contratada_ausente",
        }, 409);
      }
      try { assinaturaBytes = Uint8Array.from(atob(png), (c) => c.charCodeAt(0)); } catch { return jsonResponse({ error: "Assinatura da contratada invalida." }, 422); }
      snapshotContratada = {
        nome: fiscal.razao_social || empRow?.nome || "Criativamente",
        documento: fiscal.cnpj_cpf || null, endereco: fiscal.endereco || null,
        responsavel: fiscal.responsavel_legal || null, responsavelCpf: fiscal.responsavel_cpf || null, responsavelCargo: fiscal.responsavel_cargo || null,
      };
    }

    const token = gerarTokenBase64Url();
    const tokenHash = await sha256Hex(token);
    const tokenCifrado = await cifrarToken(token);
    const expiresAt = new Date(Date.now() + diasValidade * 24 * 60 * 60 * 1000).toISOString();

    const { data: link, error: insertError } = await supabaseAdmin
      .from("contrato_links")
      .insert({
        empresa_id: contrato.empresa_id,
        contrato_id: contrato.id,
        token_hash: tokenHash,
        token_cifrado: tokenCifrado,
        expires_at: expiresAt,
        created_by: userData.user.id,
      })
      .select("id, expires_at")
      .single();

    if (insertError || !link) {
      return jsonResponse({ error: "Falha ao criar o link." }, 500);
    }

    if (assinaturaBytes && snapshotContratada) {
      const caminho = `${contrato.empresa_id}/contratos/${contrato.id}/assinatura-contratada-${Date.now()}.png`;
      const { error: upErr } = await supabaseAdmin.storage.from("documentos-internos").upload(caminho, assinaturaBytes, { contentType: "image/png", upsert: false });
      if (!upErr) {
        await supabaseAdmin.from("contratos").update({
          contratada_snapshot: snapshotContratada, contratada_assinatura_path: caminho, contratada_assinada_em: new Date().toISOString(),
        }).eq("id", contrato.id);
        await supabaseAdmin.from("atividades").insert({
          empresa_id: contrato.empresa_id, contrato_id: contrato.id, tipo: "contratada_assinou",
          titulo: "Assinatura da contratada registrada no contrato (ao gerar o link)", usuario_id: userData.user.id,
        });
      } else {
        console.error("Falha ao registrar assinatura da contratada:", upErr.message);
      }
    }

    if (abertos.length > 0) {
      await supabaseAdmin.from("contrato_links").update({
        status: "revogado", revoked_at: new Date().toISOString(), revoked_by: userData.user.id,
        motivo_revogacao: "Substituido por um novo link",
      }).in("id", abertos.map((l) => l.id)).in("status", ["ativo", "dados_confirmados"]);
      await supabaseAdmin.from("atividades").insert({
        empresa_id: contrato.empresa_id, contrato_id: contrato.id, tipo: "link_revogado",
        titulo: "Link anterior revogado (substituido por um novo link)", usuario_id: userData.user.id,
      });
    }

    const { error: atividadeError } = await supabaseAdmin.from("atividades").insert({
      empresa_id: contrato.empresa_id,
      contrato_id: contrato.id,
      tipo: "link_criado",
      titulo: "Link de preenchimento gerado",
      usuario_id: userData.user.id,
    });
    if (atividadeError) console.error("Falha ao registrar atividade link_criado:", atividadeError);

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
