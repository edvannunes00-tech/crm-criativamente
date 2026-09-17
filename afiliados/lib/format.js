// ============================================================
// Formatação — funções puras, sem estado, sem tocar Supabase.
// ============================================================

export function money(v) {
  if (v === null || v === undefined) return '—';
  return 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function pct(v) {
  if (v === null || v === undefined) return '—';
  return Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%';
}

// published_at/descoberto_em etc. são epoch em segundos (double
// precision), preservados 1:1 da migração da Fase 1 — não são
// timestamptz. Formatação de exibição só, nunca reescreve o dado.
export function dateFromEpoch(epochSeconds) {
  if (epochSeconds === null || epochSeconds === undefined) return '—';
  const d = new Date(epochSeconds * 1000);
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function marketplaceLabel(mp) {
  if (mp === 'shopee') return 'SHOPEE';
  if (mp === 'mercado_livre') return 'MERC. LIVRE';
  return (mp || '—').toUpperCase();
}

export function statusLabel(status) {
  const map = {
    DISCOVERED: 'Descoberto',
    FINALISTA: 'Finalista',
    APROVADO_AGUARDANDO_PUBLICACAO: 'Aguardando publicação',
    PUBLISHED: 'Publicado',
    REJECTED: 'Rejeitado',
  };
  return map[status] || status || '—';
}

export function statusPillClass(status) {
  const map = {
    PUBLISHED: 'ok',
    APROVADO_AGUARDANDO_PUBLICACAO: 'ok',
    FINALISTA: 'warn',
    REJECTED: 'danger',
    DISCOVERED: 'neu',
  };
  return map[status] || 'neu';
}

// imagem_url na migração da Fase 1 às vezes é um nome de arquivo
// local (ex: "oferta_body_bebe.png", salvo no outbox da máquina
// que minerou) em vez de uma URL pública — não existe um jeito
// honesto de exibir isso num navegador remoto. Só renderiza <img>
// quando já é mesmo uma URL http(s); senão, undefined (a tela cai
// para o placeholder), nunca inventa uma URL.
export function resolvableImageUrl(imagemUrl) {
  if (typeof imagemUrl === 'string' && /^https?:\/\//i.test(imagemUrl)) {
    return imagemUrl;
  }
  return undefined;
}
