// ============================================================
// Chamadas às Edge Functions autenticadas do módulo de contratos
// (contrato-gerar-link / contrato-revogar-link). As duas exigem
// o JWT do usuário logado no header Authorization — o mesmo token
// que o supabase-js já guarda na sessão.
// ============================================================
import { supabase, SUPABASE_URL } from './supabaseClient.js';

export async function chamarFunction(nome, payload) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Sessão expirada — faça login novamente.');

  const resp = await fetch(`${SUPABASE_URL}/functions/v1/${nome}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(payload),
  });

  const body = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const erro = new Error(body.error || `Falha ao chamar ${nome} (HTTP ${resp.status})`);
    erro.body = body;
    throw erro;
  }
  return body;
}

export async function gerarLinkContrato(contratoId, diasValidade = 7, confirmarRevogacao = false) {
  return chamarFunction('contrato-gerar-link', { contrato_id: contratoId, dias_validade: diasValidade, confirmar_revogacao: confirmarRevogacao });
}

export async function revogarLinkContrato(linkId, motivoRevogacao) {
  return chamarFunction('contrato-revogar-link', { link_id: linkId, motivo_revogacao: motivoRevogacao || null });
}

export async function cancelarRecorrencia(assinaturaId, motivo) {
  return chamarFunction('recorrencia-cancelar', { assinatura_id: assinaturaId, motivo: motivo || null });
}

export async function abrirLinkContrato(linkId) {
  return chamarFunction('contrato-abrir-link', { link_id: linkId });
}
