// ============================================================
// Edge Function: contrato-segunda-via
// ------------------------------------------------------------
// Cliente informa CPF/CNPJ para receber copia do PDF final de um
// contrato ja finalizado. NUNCA abre o PDF na pagina, NUNCA gera
// link novo, NUNCA altera contrato/assinatura -- so registra a
// tentativa e (quando um provedor real existir) dispara envio.
//
// Resposta SEMPRE identica, para nao permitir enumeracao de CPF/
// CNPJ, contrato ou e-mail cadastrado. CPF/CNPJ nunca e persistido
// em texto puro -- so o hash sha-256 do valor normalizado.
//
// verify_jwt desligado: visitante anonimo, sem sessao Supabase.
// ============================================================

import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MENSAGEM_GENERICA =
  "Se os dados estiverem corretos, enviaremos uma cópia do contrato para o e-mail cadastrado.";

const LIMITE_TENTATIVAS = 5;
const JANELA_MINUTOS = 15;

const STATUS_ELEGIVEIS = ["assinado", "validado"];

interface EmailSender {
  enviar(params: { destinatario: string; assunto: string; anexoUrl: string }): Promise<{
    enviado: boolean;
    motivo?: string;
  }>;
}

// Nao envia nada de verdade -- so documenta que a integracao ainda
// nao existe. Nunca finge sucesso.
const NoopEmailSender: EmailSender = {
  async enviar() {
    return { enviado: false, motivo: "provedor_nao_configurado" };
  },
};

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function respostaGenerica(): Response {
  return jsonResponse({ mensagem: MENSAGEM_GENERICA }, 200);
}

async function sha256Hex(texto: string): Promise<string> {
  const dados = new TextEncoder().encode(texto);
  const hashBuffer = await crypto.subtle.digest("SHA-256", dados);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function normalizarCpfCnpj(valor: string): string {
  return valor.replace(/\D/g, "");
}

// O caller pode injetar um primeiro valor forjado na cadeia XFF --
// o valor confiavel e o ULTIMO da cadeia, adicionado pela infra da
// Supabase (que fica entre o cliente e esta function), nunca o
// primeiro (que o proprio cliente controla).
function extrairIpConfiavel(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (!xff) return "desconhecido";
  const partes = xff.split(",").map((p) => p.trim());
  return partes[partes.length - 1] || "desconhecido";
}

function criarSupabaseAdmin() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    db: { schema: "crm" },
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

    let body: { cpf_cnpj?: string };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Corpo da requisicao invalido" }, 400);
    }

    const cpfCnpjBruto = body.cpf_cnpj;
    if (!cpfCnpjBruto || typeof cpfCnpjBruto !== "string") {
      return jsonResponse({ error: "cpf_cnpj e obrigatorio" }, 400);
    }

    const cpfCnpjNormalizado = normalizarCpfCnpj(cpfCnpjBruto);
    // So valida FORMATO (11 = CPF, 14 = CNPJ) -- nunca revela se o
    // valor "existe" em algum lugar. Formato claramente invalido e
    // um erro estrutural do chamador, nao uma tentativa de consulta.
    if (cpfCnpjNormalizado.length !== 11 && cpfCnpjNormalizado.length !== 14) {
      return jsonResponse({ error: "cpf_cnpj com formato invalido" }, 400);
    }

    const cpfCnpjHash = await sha256Hex(cpfCnpjNormalizado);
    const ip = extrairIpConfiavel(req);
    const ipHash = await sha256Hex(ip);

    const supabaseAdmin = criarSupabaseAdmin();

    // ---- Rate limit: checa ANTES de qualquer busca real de dados.
    const janelaInicio = new Date(Date.now() - JANELA_MINUTOS * 60 * 1000).toISOString();
    const { count: tentativasCpf } = await supabaseAdmin
      .from("contrato_segunda_via_solicitacoes")
      .select("id", { count: "exact", head: true })
      .eq("cpf_cnpj_hash", cpfCnpjHash)
      .gte("created_at", janelaInicio);

    const { count: tentativasIp } = await supabaseAdmin
      .from("contrato_segunda_via_solicitacoes")
      .select("id", { count: "exact", head: true })
      .eq("ip_hash", ipHash)
      .gte("created_at", janelaInicio);

    if ((tentativasCpf ?? 0) >= LIMITE_TENTATIVAS || (tentativasIp ?? 0) >= LIMITE_TENTATIVAS) {
      await supabaseAdmin.from("contrato_segunda_via_solicitacoes").insert({
        cpf_cnpj_hash: cpfCnpjHash,
        ip_hash: ipHash,
        status: "bloqueado_rate_limit",
      });
      return respostaGenerica();
    }

    // ---- Busca o contrato finalizado cujo snapshot do cliente bate
    // com o CPF/CNPJ informado. Comparacao normalizada dos dois lados
    // (o snapshot pode ter sido salvo com pontuacao).
    const { data: candidatos } = await supabaseAdmin
      .from("contrato_dados_cliente")
      .select("contrato_id, empresa_id, email, cpf_cnpj")
      .not("cpf_cnpj", "is", null);

    const candidato = (candidatos ?? []).find(
      (c) => normalizarCpfCnpj(c.cpf_cnpj ?? "") === cpfCnpjNormalizado
    );

    if (!candidato) {
      await supabaseAdmin.from("contrato_segunda_via_solicitacoes").insert({
        cpf_cnpj_hash: cpfCnpjHash,
        ip_hash: ipHash,
        status: "invalido",
      });
      return respostaGenerica();
    }

    const { data: contrato } = await supabaseAdmin
      .from("contratos")
      .select("id, status")
      .eq("id", candidato.contrato_id)
      .maybeSingle();

    if (!contrato || !STATUS_ELEGIVEIS.includes(contrato.status)) {
      await supabaseAdmin.from("contrato_segunda_via_solicitacoes").insert({
        empresa_id: candidato.empresa_id,
        contrato_id: candidato.contrato_id,
        cpf_cnpj_hash: cpfCnpjHash,
        ip_hash: ipHash,
        status: "invalido",
      });
      return respostaGenerica();
    }

    // ---- Documento final: exatamente o que ja esta armazenado, sem
    // reconstruir nada. So a versao mais recente marcada 'assinado'.
    const { data: versoes } = await supabaseAdmin
      .from("contratos_versoes")
      .select("versao, documento_id")
      .eq("contrato_id", contrato.id)
      .order("versao", { ascending: false });

    let storagePath: string | null = null;
    for (const versao of versoes ?? []) {
      if (!versao.documento_id) continue;
      const { data: documento } = await supabaseAdmin
        .from("documentos")
        .select("storage_path, categoria_documento")
        .eq("id", versao.documento_id)
        .maybeSingle();
      if (documento?.categoria_documento === "assinado") {
        storagePath = documento.storage_path;
        break;
      }
    }

    if (!storagePath) {
      // Contrato "assinado/validado" mas sem PDF de fato anexado ainda
      // -- trata como nao encontrado para fins de segunda via.
      await supabaseAdmin.from("contrato_segunda_via_solicitacoes").insert({
        empresa_id: candidato.empresa_id,
        contrato_id: candidato.contrato_id,
        cpf_cnpj_hash: cpfCnpjHash,
        ip_hash: ipHash,
        status: "invalido",
      });
      return respostaGenerica();
    }

    const { data: solicitacao } = await supabaseAdmin
      .from("contrato_segunda_via_solicitacoes")
      .insert({
        empresa_id: candidato.empresa_id,
        contrato_id: candidato.contrato_id,
        cpf_cnpj_hash: cpfCnpjHash,
        ip_hash: ipHash,
        status: "valido",
      })
      .select("id")
      .single();

    const resultadoEnvio = await NoopEmailSender.enviar({
      destinatario: candidato.email ?? "",
      assunto: "Segunda via do seu contrato",
      anexoUrl: storagePath,
    });

    if (solicitacao) {
      const { error: updateStatusError } = await supabaseAdmin
        .from("contrato_segunda_via_solicitacoes")
        .update({
          status: resultadoEnvio.enviado ? "enviado" : "falha_envio",
          enviado_em: resultadoEnvio.enviado ? new Date().toISOString() : null,
        })
        .eq("id", solicitacao.id);

      if (updateStatusError) {
        console.error("Falha ao atualizar status da solicitacao de segunda via:", updateStatusError);
      }
    }

    // Mesma mensagem generica sempre -- nesta fase nunca ha
    // email_mascarado porque o NoopEmailSender nunca confirma envio.
    return respostaGenerica();
  } catch (err) {
    console.error("contrato-segunda-via erro inesperado:", err);
    return respostaGenerica();
  }
});
