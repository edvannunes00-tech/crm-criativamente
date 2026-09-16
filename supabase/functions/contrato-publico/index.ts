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
  if (!acesso || acesso.status_link !== "ativo") {
    return jsonResponse({ disponivel: false }, 200);
  }

  // Payload minimo: so as colunas comerciais que a pagina publica
  // pode mostrar. Nunca select("*"), nunca empresa_id/contato_id/
  // dados internos de assinatura/validacao/observacoes.
  const { data: contrato, error: contratoError } = await supabaseAdmin
    .from("contratos")
    .select(
      "titulo, valor_tabela_total, valor_negociado_total, desconto_total, condicoes_pagamento_texto, condicoes_especiais"
    )
    .eq("id", acesso.contrato_id)
    .maybeSingle();

  if (contratoError || !contrato) {
    return jsonResponse({ disponivel: false }, 200);
  }

  const { data: itens } = await supabaseAdmin
    .from("contrato_itens")
    .select("descricao, quantidade, valor_tabela_unitario, valor_negociado_unitario, valor_total")
    .eq("contrato_id", acesso.contrato_id);

  const { data: bonus } = await supabaseAdmin
    .from("contrato_bonus")
    .select("descricao, quantidade")
    .eq("contrato_id", acesso.contrato_id);

  return jsonResponse(
    {
      disponivel: true,
      contrato: {
        ...contrato,
        itens: itens ?? [],
        bonus: bonus ?? [],
      },
    },
    200
  );
}

interface DadosCliente {
  nome_completo?: string | null;
  cpf_cnpj?: string | null;
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
  return "erro_desconhecido";
}

async function handlePost(req: Request): Promise<Response> {
  let body: { token?: string; acao?: string; dados?: DadosCliente };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Corpo da requisicao invalido" }, 400);
  }

  const { token, acao, dados } = body;
  if (!token || typeof token !== "string") {
    return jsonResponse({ error: "token e obrigatorio" }, 400);
  }
  if (acao !== "salvar" && acao !== "confirmar") {
    return jsonResponse({ error: "acao deve ser 'salvar' ou 'confirmar'" }, 400);
  }

  const tokenHash = await sha256Hex(token);
  const supabaseAdmin = criarSupabaseAdmin();

  if (acao === "salvar") {
    if (!dados || typeof dados !== "object") {
      return jsonResponse({ error: "dados e obrigatorio para acao=salvar" }, 400);
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
    });

    if (error) {
      return jsonResponse({ ok: false, motivo: mapaErroNegocio(error.message) }, 200);
    }
    return jsonResponse({ ok: true }, 200);
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
