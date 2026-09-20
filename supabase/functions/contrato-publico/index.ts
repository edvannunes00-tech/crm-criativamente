// ============================================================
// Edge Function: contrato-publico
// ------------------------------------------------------------
// Unico ponto de acesso publico (sem sessao Supabase) ao conteudo
// de um contrato. GET carrega a pagina, POST salva rascunho ou
// confirma. O contrato_id NUNCA vem de parametro do chamador --
// e sempre resolvido a partir do hash do token, via a funcao SQL
// crm.registrar_acesso_link_contrato().
//
// verify_jwt fica desligado no deploy: nao existe sessao Supabase
// aqui, a "autenticacao" e o proprio token do link, validado a
// cada requisicao contra crm.contrato_links.
// ============================================================

import { createClient } from "jsr:@supabase/supabase-js@2";
import { validarDocumento } from "../_shared/documento.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

async function sha256Hex(texto: string): Promise<string> {
  const dados = new TextEncoder().encode(texto);
  const hashBuffer = await crypto.subtle.digest("SHA-256", dados);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function criarSupabaseAdmin() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    db: { schema: "crm" },
  });
}

async function temRecorrencia(supabaseAdmin: ReturnType<typeof criarSupabaseAdmin>, contratoId: string): Promise<boolean> {
  // Snapshot gravado no item no momento da contratacao (migration 30), nunca o catalogo vivo.
  const { data } = await supabaseAdmin.from("contrato_itens").select("id").eq("contrato_id", contratoId).not("recorrencia_tipo", "is", null).limit(1);
  return (data ?? []).length > 0;
}

async function dadosContratada(supabaseAdmin: ReturnType<typeof criarSupabaseAdmin>, empresaId: string, contratoId?: string) {
  const { data: empresaRow } = await supabaseAdmin.from("empresas").select("nome").eq("id", empresaId).maybeSingle();
  const { data: fiscalRow } = await supabaseAdmin.from("configuracoes").select("valor").eq("empresa_id", empresaId).eq("chave", "dados_fiscais_contratada").maybeSingle();
  const fiscal = (fiscalRow?.valor as Record<string, string | null>) ?? {};
  let base = {
    nome: fiscal.razao_social || empresaRow?.nome || "Criativamente",
    documento: fiscal.cnpj_cpf || null,
    endereco: fiscal.endereco || null,
    responsavel: fiscal.responsavel_legal || null,
    responsavelCpf: fiscal.responsavel_cpf || null,
    responsavelCargo: fiscal.responsavel_cargo || null,
  };
  let assinatura: { dataUrl: string; assinadoEm: string } | null = null;
  if (contratoId) {
    // Dados e assinatura da contratada REGISTRADOS no contrato (ao gerar o link) prevalecem sobre a config atual.
    const { data: c } = await supabaseAdmin.from("contratos").select("contratada_snapshot, contratada_assinatura_path, contratada_assinada_em").eq("id", contratoId).maybeSingle();
    if (c?.contratada_snapshot) base = { ...base, ...(c.contratada_snapshot as Record<string, string | null>) } as typeof base;
    if (c?.contratada_assinatura_path && c.contratada_assinada_em) {
      const { data: arq } = await supabaseAdmin.storage.from("documentos-internos").download(c.contratada_assinatura_path);
      if (arq) {
        const bytes = new Uint8Array(await arq.arrayBuffer());
        let bin = ""; for (const b of bytes) bin += String.fromCharCode(b);
        assinatura = { dataUrl: `data:image/png;base64,${btoa(bin)}`, assinadoEm: c.contratada_assinada_em };
      }
    }
  }
  return { ...base, assinatura };
}

async function handleGet(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const token = url.searchParams.get("t");
  if (!token) {
    return jsonResponse({ error: "Parametro t (token) e obrigatorio" }, 400);
  }

  const tokenHash = await sha256Hex(token);
  const supabaseAdmin = criarSupabaseAdmin();

  const { data: acessoRows, error: acessoError } = await supabaseAdmin.rpc(
    "registrar_acesso_link_contrato",
    { p_token_hash: tokenHash }
  );

  if (acessoError) {
    return jsonResponse({ error: "Falha ao validar o link." }, 500);
  }

  const acesso = acessoRows?.[0];

  // Depois que o cliente confirma os dados o link fica "dados_confirmados" (etapa intermediaria:
  // falta pagamento, se houver, e a ASSINATURA). So a assinatura torna o link "confirmado" e trava.
  // Contrato de recorrencia ja assinado continua mostrando a tela final. Nunca devolve dados pessoais.
  let posConfirmacao = false;
  let assinado = false;
  if (acesso && (acesso.status_link === "dados_confirmados" || acesso.status_link === "confirmado")) {
    const recorrente = await temRecorrencia(supabaseAdmin, acesso.contrato_id);
    if (acesso.status_link === "dados_confirmados" || recorrente) {
      posConfirmacao = true;
      assinado = acesso.status_link === "confirmado";
    }
  }

  if (!acesso || (acesso.status_link !== "ativo" && !posConfirmacao)) {
    return jsonResponse({ disponivel: false }, 200);
  }

  // Payload minimo: so as colunas comerciais que a pagina publica
  // pode mostrar. Nunca select("*"), nunca contato_id/dados internos
  // de assinatura/validacao/observacoes. empresa_id e selecionado so
  // pra resolver nome/dados fiscais da CONTRATADA (nunca vai na resposta).
  const { data: contrato, error: contratoError } = await supabaseAdmin
    .from("contratos")
    .select(
      "empresa_id, titulo, suporte_inicio, valor_tabela_total, valor_negociado_total, desconto_total, condicoes_pagamento_texto, condicoes_especiais"
    )
    .eq("id", acesso.contrato_id)
    .maybeSingle();

  if (contratoError || !contrato) {
    return jsonResponse({ disponivel: false }, 200);
  }

  // Escopo detalhado e termos contratuais fazem parte do SNAPSHOT gravado
  // no proprio item (migrations 23/24) -- nunca do catalogo vivo.
  const { data: itens } = await supabaseAdmin
    .from("contrato_itens")
    .select(
      "descricao, quantidade, valor_tabela_unitario, valor_negociado_unitario, valor_total, " +
        "escopo_objeto, escopo_quantidade_maxima_aulas, escopo_modalidade_gravacao, escopo_equipamentos, " +
        "escopo_direcao, escopo_edicao, escopo_capas, escopo_plataforma, escopo_pagina_vendas, " +
        "escopo_certificado, escopo_apostila_material, escopo_legendas, escopo_vinheta, escopo_site, " +
        "escopo_midia_fisica, escopo_prazo_suporte_meses, escopo_observacoes, escopo_exclusoes, termos_contratuais"
    )
    .eq("contrato_id", acesso.contrato_id);

  const { data: bonus } = await supabaseAdmin
    .from("contrato_bonus")
    .select("descricao, quantidade")
    .eq("contrato_id", acesso.contrato_id);

  const recorrencia = await temRecorrencia(supabaseAdmin, acesso.contrato_id);
  const { empresa_id: _empresaId, ...contratoPublico } = contrato;

  return jsonResponse(
    {
      disponivel: true,
      pos_confirmacao: posConfirmacao,
      assinado,
      contrato: {
        ...contratoPublico,
        codigo: String(acesso.contrato_id).slice(0, 8),
        itens: itens ?? [],
        bonus: bonus ?? [],
        recorrencia,
      },
      contratada: await dadosContratada(supabaseAdmin, contrato.empresa_id, acesso.contrato_id),
    },
    200
  );
}

interface DadosCliente {
  nome_completo?: string | null;
  cpf_cnpj?: string | null;
  empresa_marca?: string | null;
  telefone?: string | null;
  email?: string | null;
  endereco_cep?: string | null;
  endereco_logradouro?: string | null;
  endereco_numero?: string | null;
  endereco_complemento?: string | null;
  endereco_bairro?: string | null;
  endereco_cidade?: string | null;
  endereco_estado?: string | null;
}

function mapaErroNegocio(mensagem: string): string {
  if (mensagem.includes("link_indisponivel")) return "link_indisponivel";
  if (mensagem.includes("dados_nao_preenchidos")) return "dados_nao_preenchidos";
  if (mensagem.includes("dados_incompletos")) return "dados_incompletos";
  if (mensagem.includes("assinatura_ja_registrada")) return "assinatura_ja_registrada";
  if (mensagem.includes("pagamento_em_andamento")) return "pagamento_em_andamento";
  return "erro_desconhecido";
}

async function handleAssinar(supabaseAdmin: ReturnType<typeof criarSupabaseAdmin>, tokenHash: string, imagemBase64: string): Promise<Response> {
  // Resolve empresa/contrato via SELECT direto (sem efeito colateral --
  // diferente de registrar_acesso_link_contrato, que mexe em access_count).
  const { data: link } = await supabaseAdmin
    .from("contrato_links")
    .select("empresa_id, contrato_id, status")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (!link || link.status !== "dados_confirmados") {
    return jsonResponse({ ok: false, motivo: "link_indisponivel" }, 200);
  }

  // Contrato de recorrencia: so assina depois que o PROVEDOR confirmou a assinatura
  // (status financeiro "ativo" gravado pelo backend) -- nunca por afirmacao do navegador.
  if (await temRecorrencia(supabaseAdmin, link.contrato_id)) {
    const { data: rec } = await supabaseAdmin
      .from("assinaturas_recorrentes")
      .select("id")
      .eq("contrato_id", link.contrato_id)
      .eq("status_financeiro", "ativo")
      .limit(1)
      .maybeSingle();
    if (!rec) return jsonResponse({ ok: false, motivo: "pagamento_pendente" }, 200);
  }

  let bytes: Uint8Array;
  try {
    const base64Limpo = imagemBase64.replace(/^data:image\/png;base64,/, "");
    bytes = Uint8Array.from(atob(base64Limpo), (c) => c.charCodeAt(0));
  } catch {
    return jsonResponse({ error: "Imagem de assinatura invalida" }, 400);
  }
  // Limite generoso pra um desenho simples (evita abuso de payload gigante).
  if (bytes.length > 2 * 1024 * 1024) {
    return jsonResponse({ error: "Imagem de assinatura muito grande" }, 400);
  }

  const storagePath = `${link.empresa_id}/contratos/${link.contrato_id}/assinatura-cliente-${Date.now()}.png`;
  const { error: uploadError } = await supabaseAdmin.storage
    .from("documentos-internos")
    .upload(storagePath, bytes, { contentType: "image/png", upsert: false });
  if (uploadError) {
    return jsonResponse({ error: "Falha ao salvar a assinatura." }, 500);
  }

  const { error: registroError } = await supabaseAdmin.rpc("registrar_assinatura_contrato", {
    p_token_hash: tokenHash,
    p_storage_path: storagePath,
  });

  if (registroError) {
    return jsonResponse({ ok: false, motivo: mapaErroNegocio(registroError.message) }, 200);
  }

  return jsonResponse({ ok: true }, 200);
}

async function handlePost(req: Request): Promise<Response> {
  let body: { token?: string; acao?: string; dados?: DadosCliente; imagem?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Corpo da requisicao invalido" }, 400);
  }

  const { token, acao, dados } = body;
  if (!token || typeof token !== "string") {
    return jsonResponse({ error: "token e obrigatorio" }, 400);
  }
  if (acao !== "salvar" && acao !== "confirmar" && acao !== "assinar" && acao !== "reabrir") {
    return jsonResponse({ error: "acao deve ser 'salvar', 'confirmar', 'assinar' ou 'reabrir'" }, 400);
  }

  const tokenHash = await sha256Hex(token);
  const supabaseAdmin = criarSupabaseAdmin();

  if (acao === "salvar") {
    if (!dados || typeof dados !== "object") {
      return jsonResponse({ error: "dados e obrigatorio para acao=salvar" }, 400);
    }
    if (!validarDocumento(String(dados.cpf_cnpj ?? "")).ok) {
      return jsonResponse({ ok: false, motivo: "documento_invalido" }, 200);
    }
    const { error } = await supabaseAdmin.rpc("salvar_rascunho_dados_contrato", {
      p_token_hash: tokenHash,
      p_nome_completo: dados.nome_completo ?? null,
      p_cpf_cnpj: dados.cpf_cnpj ?? null,
      p_telefone: dados.telefone ?? null,
      p_email: dados.email ?? null,
      p_endereco_cep: dados.endereco_cep ?? null,
      p_endereco_logradouro: dados.endereco_logradouro ?? null,
      p_endereco_numero: dados.endereco_numero ?? null,
      p_endereco_complemento: dados.endereco_complemento ?? null,
      p_endereco_bairro: dados.endereco_bairro ?? null,
      p_endereco_cidade: dados.endereco_cidade ?? null,
      p_endereco_estado: dados.endereco_estado ?? null,
      p_empresa_marca: dados.empresa_marca ?? null,
    });

    if (error) {
      return jsonResponse({ ok: false, motivo: mapaErroNegocio(error.message) }, 200);
    }
    return jsonResponse({ ok: true }, 200);
  }

  if (acao === "reabrir") {
    const { error } = await supabaseAdmin.rpc("reabrir_dados_contrato", { p_token_hash: tokenHash });
    if (error) return jsonResponse({ ok: false, motivo: mapaErroNegocio(error.message) }, 200);
    return jsonResponse({ ok: true }, 200);
  }

  if (acao === "assinar") {
    if (!body.imagem || typeof body.imagem !== "string") {
      return jsonResponse({ error: "imagem e obrigatoria para acao=assinar" }, 400);
    }
    return await handleAssinar(supabaseAdmin, tokenHash, body.imagem);
  }

  // acao === "confirmar" -- delega inteiramente a funcao atomica.
  const { data, error } = await supabaseAdmin.rpc("confirmar_dados_contrato", {
    p_token_hash: tokenHash,
  });

  if (error) {
    return jsonResponse({ ok: false, motivo: mapaErroNegocio(error.message) }, 200);
  }

  const resultado = data?.[0];
  return jsonResponse(
    { ok: true, novo_status_contrato: resultado?.novo_status_contrato ?? null },
    200
  );
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: CORS_HEADERS });
  }

  try {
    if (req.method === "GET") return await handleGet(req);
    if (req.method === "POST") return await handlePost(req);
    return jsonResponse({ error: "Metodo nao permitido" }, 405);
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});
