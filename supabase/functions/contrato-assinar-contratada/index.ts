// ============================================================
// Edge Function: contrato-assinar-contratada  (verify_jwt = true)
// Registra a assinatura da CONTRATADA (cadastrada em Dados da contratada) e os dados dela neste
// contrato, com data/hora, SEM gerar link novo. Para contratos criados antes de o link registrar
// a assinatura. Uma vez registrada, nao muda. Se o cliente ja assinou, so administrador.
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
    let body: { contrato_id?: string };
    try { body = await req.json(); } catch { return json({ error: "Corpo invalido" }, 400); }
    if (!body.contrato_id) return json({ error: "contrato_id e obrigatorio" }, 400);

    const supabaseUser = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: `Bearer ${jwt}` } } });
    const { data: userData, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !userData?.user) return json({ error: "Nao autenticado" }, 401);
    const userId = userData.user.id;

    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { db: { schema: "crm" } });
    const { data: contrato } = await db.from("contratos").select("id, empresa_id, contratada_assinada_em").eq("id", body.contrato_id).maybeSingle();
    if (!contrato) return json({ error: "Contrato nao encontrado" }, 404);
    const perm = async (acao: string) => Boolean((await db.rpc("tem_permissao", { p_usuario_id: userId, p_empresa_id: contrato.empresa_id, p_modulo_chave: "contratos", p_acao: acao })).data);
    if (!(await perm("editar"))) return json({ error: "Sem permissao." }, 403);
    if (contrato.contratada_assinada_em) return json({ ok: true, ja_registrada: true });

    const { data: assinou } = await db.from("contrato_dados_cliente").select("id").eq("contrato_id", contrato.id).not("assinatura_confirmada_em", "is", null).limit(1);
    if ((assinou ?? []).length > 0 && !(await perm("administrar"))) {
      return json({ error: "O cliente ja assinou este contrato. Somente um administrador pode registrar a assinatura da contratada agora.", motivo: "somente_admin" }, 403);
    }

    const { data: fiscalRow } = await db.from("configuracoes").select("valor").eq("empresa_id", contrato.empresa_id).eq("chave", "dados_fiscais_contratada").maybeSingle();
    const { data: empRow } = await db.from("empresas").select("nome").eq("id", contrato.empresa_id).maybeSingle();
    const fiscal = (fiscalRow?.valor as Record<string, string | null>) ?? {};
    const png = typeof fiscal.assinatura_png === "string" ? fiscal.assinatura_png.replace(/^data:image\/png;base64,/, "") : "";
    if (!png) return json({ error: "Cadastre a assinatura da contratada em Dados e assinatura da contratada (Editar) antes.", motivo: "assinatura_contratada_ausente" }, 409);
    let bytes: Uint8Array;
    try { bytes = Uint8Array.from(atob(png), (c) => c.charCodeAt(0)); } catch { return json({ error: "Assinatura da contratada invalida." }, 422); }

    const caminho = `${contrato.empresa_id}/contratos/${contrato.id}/assinatura-contratada-${Date.now()}.png`;
    const { error: upErr } = await db.storage.from("documentos-internos").upload(caminho, bytes, { contentType: "image/png", upsert: false });
    if (upErr) return json({ ok: false, motivo: "falha_ao_salvar" }, 500);
    const { error: updErr } = await db.from("contratos").update({
      contratada_snapshot: {
        nome: fiscal.razao_social || empRow?.nome || "Criativamente", documento: fiscal.cnpj_cpf || null, endereco: fiscal.endereco || null,
        responsavel: fiscal.responsavel_legal || null, responsavelCpf: fiscal.responsavel_cpf || null, responsavelCargo: fiscal.responsavel_cargo || null,
      },
      contratada_assinatura_path: caminho, contratada_assinada_em: new Date().toISOString(),
    }).eq("id", contrato.id).is("contratada_assinada_em", null);
    if (updErr) return json({ ok: false, motivo: "falha_ao_salvar" }, 500);
    await db.from("atividades").insert({ empresa_id: contrato.empresa_id, contrato_id: contrato.id, tipo: "contratada_assinou", titulo: "Assinatura da contratada registrada no contrato", usuario_id: userId });
    return json({ ok: true });
  } catch (_e) {
    return json({ ok: false, motivo: "erro_interno" }, 500);
  }
});
