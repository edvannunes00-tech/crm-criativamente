// ============================================================
// Edge Function: contrato-enviar-copia  (verify_jwt = false; autenticidade = token do link ja ASSINADO)
// ------------------------------------------------------------
// Depois que o cliente assina, a pagina publica gera a copia em PDF e envia para ca. Esta funcao:
//  * so aceita link 'confirmado' (assinado) e so uma vez por link;
//  * envia a copia ao e-mail que o CLIENTE informou (lido do banco, nunca do corpo da requisicao);
//  * avisa a Criativamente (ADMIN_NOTIFICATION_EMAIL, padrao edvannunes00@gmail.com) com o mesmo PDF;
//  * guarda a copia no Storage para a segunda via.
// A copia e um comprovante para o cliente; a versao oficial e a gerada no CRM.
// ============================================================
import { createClient } from "jsr:@supabase/supabase-js@2";
import { enviarResend, templateAviso, textoParaHtml } from "../_shared/email.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });

async function sha256Hex(t: string): Promise<string> {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
  return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: CORS_HEADERS });
  try {
    if (req.method !== "POST") return json({ error: "Metodo nao permitido" }, 405);
    const apiKey = Deno.env.get("RESEND_API_KEY");
    const from = Deno.env.get("RESEND_FROM_EMAIL");
    if (!apiKey || !from) return json({ ok: false, motivo: "email_nao_configurado" });

    let body: { token?: string; pdf_base64?: string };
    try { body = await req.json(); } catch { return json({ error: "Corpo invalido" }, 400); }
    if (!body.token || typeof body.token !== "string" || !body.pdf_base64 || typeof body.pdf_base64 !== "string") return json({ error: "parametros invalidos" }, 400);

    let bytes: Uint8Array;
    try { bytes = Uint8Array.from(atob(body.pdf_base64), (c) => c.charCodeAt(0)); } catch { return json({ error: "pdf invalido" }, 400); }
    if (bytes.length < 200 || bytes.length > 6 * 1024 * 1024 || String.fromCharCode(...bytes.slice(0, 5)) !== "%PDF-") return json({ error: "pdf invalido" }, 400);

    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { db: { schema: "crm" } });
    const { data: link } = await db.from("contrato_links").select("id, empresa_id, contrato_id, status, copia_enviada_em").eq("token_hash", await sha256Hex(body.token)).maybeSingle();
    if (!link || link.status !== "confirmado") return json({ ok: false, motivo: "link_indisponivel" });
    if (link.copia_enviada_em) return json({ ok: true, ja_enviada: true });

    const { data: dados } = await db.from("contrato_dados_cliente").select("nome_completo, email, assinatura_confirmada_em").eq("link_id", link.id).maybeSingle();
    if (!dados?.assinatura_confirmada_em || !dados.email) return json({ ok: false, motivo: "sem_email" });
    const { data: contrato } = await db.from("contratos").select("titulo").eq("id", link.contrato_id).maybeSingle();

    const caminho = `${link.empresa_id}/contratos/${link.contrato_id}/copia-cliente-${Date.now()}.pdf`;
    const { error: upErr } = await db.storage.from("documentos-internos").upload(caminho, bytes, { contentType: "application/pdf", upsert: false });
    if (upErr) return json({ ok: false, motivo: "falha_ao_guardar" });
    await db.from("contrato_links").update({ copia_storage_path: caminho }).eq("id", link.id);

    const anexo = [{ filename: "contrato-assinado.pdf", base64: body.pdf_base64 }];
    const primeiroNome = String(dados.nome_completo ?? "").split(" ")[0] || "";
    const assuntoCliente = "Seu contrato assinado — Criativamente";
    const msgCliente = `Olá${primeiroNome ? `, ${primeiroNome}` : ""}!\n\nRecebemos a sua assinatura. Segue em anexo a cópia do contrato "${contrato?.titulo ?? ""}" para o seu arquivo.\n\nNossa equipe entrará em contato com os próximos passos. Se precisar de outra cópia no futuro, você pode solicitar a segunda via pelo mesmo link do contrato.`;
    try {
      await enviarResend(apiKey, from, dados.email, assuntoCliente, templateAviso(assuntoCliente, assuntoCliente, textoParaHtml(msgCliente)), { anexos: anexo });
    } catch { return json({ ok: false, motivo: "falha_no_envio" }); }

    await db.from("contrato_links").update({ copia_enviada_em: new Date().toISOString() }).eq("id", link.id);
    const contato = Deno.env.get("EMAIL_CONTATO") ?? "contato@criativamentedigital.com.br";
    await db.from("emails").insert({
      empresa_id: link.empresa_id, direction: "outbound", from_email: contato, from_name: "Criativamente", to_email: dados.email,
      subject: assuntoCliente, body_text: msgCliente, is_read: true, origem: "sistema",
      anexos: [{ filename: "contrato-assinado.pdf", mimeType: "application/pdf", size: bytes.length, path: caminho }],
    });

    // Aviso para a equipe (falha aqui nao invalida o envio ao cliente)
    try {
      const admin = Deno.env.get("ADMIN_NOTIFICATION_EMAIL") ?? "edvannunes00@gmail.com";
      const assuntoAdmin = `Contrato assinado: ${contrato?.titulo ?? ""}`;
      const msgAdmin = `${dados.nome_completo ?? "O cliente"} assinou o contrato "${contrato?.titulo ?? ""}".\n\nA cópia enviada ao cliente segue em anexo. Gere a versão oficial no CRM (aba Documento) e conclua a validação.`;
      await enviarResend(apiKey, from, admin, assuntoAdmin, templateAviso(assuntoAdmin, assuntoAdmin, textoParaHtml(msgAdmin)), { anexos: anexo });
    } catch { /* aviso opcional */ }

    return json({ ok: true });
  } catch (_e) {
    return json({ ok: false, motivo: "erro_interno" }, 500);
  }
});
