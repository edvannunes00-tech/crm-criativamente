// Cloudflare Email Worker: recebe e-mails de contato@criativamentedigital.com.br (Email Routing ->
// "Send to a Worker"), interpreta com postal-mime e entrega ao CRM (Edge Function email-entrada).
// SEMPRE encaminha tambem para a caixa pessoal (FORWARD_TO): a caixa do CRM e um complemento,
// nunca o unico lugar onde a mensagem chega.
import PostalMime from 'postal-mime';

interface Env {
  FUNCTION_URL: string;
  EMAIL_ENTRADA_SECRET: string;
  FORWARD_TO?: string;
}

const ANEXO_MAX = 8 * 1024 * 1024;
const ANEXOS_MAX = 5;

function paraBase64(bytes: Uint8Array): string {
  let bin = '';
  const passo = 0x8000;
  for (let i = 0; i < bytes.length; i += passo) bin += String.fromCharCode(...bytes.subarray(i, i + passo));
  return btoa(bin);
}

export default {
  async email(message: ForwardableEmailMessage, env: Env): Promise<void> {
    try {
      const bruto = await new Response(message.raw).arrayBuffer();
      const p = await PostalMime.parse(bruto);
      const anexos = (p.attachments || [])
        .filter((a) => a.disposition !== 'inline')
        .slice(0, ANEXOS_MAX)
        .map((a) => {
          const bytes = typeof a.content === 'string' ? new TextEncoder().encode(a.content) : new Uint8Array(a.content as ArrayBuffer);
          return { filename: a.filename || 'anexo', mime: a.mimeType || 'application/octet-stream', bytes };
        })
        .filter((a) => a.bytes.byteLength > 0 && a.bytes.byteLength <= ANEXO_MAX)
        .map((a) => ({ filename: a.filename, mime: a.mime, base64: paraBase64(a.bytes) }));

      const resposta = await fetch(env.FUNCTION_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-email-secret': env.EMAIL_ENTRADA_SECRET },
        body: JSON.stringify({
          from_email: (p.from?.address || message.from || '').toLowerCase(),
          from_name: p.from?.name || null,
          to: message.to,
          subject: p.subject || null,
          text: p.text || p.html || '',
          message_id: p.messageId || null,
          attachments: anexos,
        }),
      });
      if (!resposta.ok) console.error('[email-entrada] CRM respondeu', resposta.status);
    } catch (erro) {
      console.error('[email-entrada] falha ao entregar ao CRM', erro instanceof Error ? erro.message : String(erro));
    }

    if (env.FORWARD_TO) {
      try { await message.forward(env.FORWARD_TO); }
      catch (erro) { console.error('[email-entrada] falha ao encaminhar', erro instanceof Error ? erro.message : String(erro)); }
    }
  },
};
