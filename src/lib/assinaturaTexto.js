// ============================================================
// Assinatura digitada em letra cursiva: desenha o nome no MESMO
// <canvas> da assinatura desenhada (tinta escura, fundo transparente),
// então todo o fluxo posterior (toDataURL -> Storage -> PDF) é idêntico.
// É a mesma assinatura eletrônica simples do fluxo — não é ICP-Brasil.
// ============================================================
export const FONTES_ASSINATURA = [
  { valor: 'Dancing Script', label: 'Dancing Script' },
  { valor: 'Great Vibes', label: 'Great Vibes' },
  { valor: 'Caveat', label: 'Caveat (manuscrita)' },
];

export const LINK_FONTES_ASSINATURA = 'https://fonts.googleapis.com/css2?family=Caveat:wght@600&family=Dancing+Script:wght@600&family=Great+Vibes&display=swap';

export function garantirFontesAssinatura() {
  if (document.querySelector('link[data-fontes-assinatura]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = LINK_FONTES_ASSINATURA;
  link.dataset.fontesAssinatura = '1';
  document.head.appendChild(link);
}

// Retorna true se desenhou algo (texto não vazio).
export async function desenharTextoNoCanvas(canvas, texto, fonte) {
  const ctx = canvas.getContext('2d');
  const limpo = String(texto || '').trim();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!limpo) return false;
  try { await document.fonts.load(`64px "${fonte}"`); } catch { /* usa fallback */ }
  let tamanho = Math.min(80, canvas.height * 0.55);
  ctx.font = `600 ${tamanho}px "${fonte}", cursive`;
  const margem = 24;
  while (ctx.measureText(limpo).width > canvas.width - margem * 2 && tamanho > 16) {
    tamanho -= 2;
    ctx.font = `600 ${tamanho}px "${fonte}", cursive`;
  }
  ctx.fillStyle = '#12141a';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(limpo, canvas.width / 2, canvas.height / 2);
  ctx.textAlign = 'start';
  ctx.textBaseline = 'alphabetic';
  return true;
}
