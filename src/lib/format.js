export function formatarMoeda(valor) {
  if (valor === null || valor === undefined) return '—';
  return Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatarData(iso, comHora = false) {
  if (!iso) return '—';
  const d = new Date(iso);
  const opts = comHora
    ? { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }
    : { day: '2-digit', month: '2-digit', year: 'numeric' };
  return d.toLocaleString('pt-BR', opts);
}

export function tempoRelativo(iso) {
  if (!iso) return '—';
  const diffMs = Date.now() - new Date(iso).getTime();
  const dias = Math.floor(diffMs / 86400000);
  if (dias <= 0) return 'hoje';
  if (dias === 1) return 'ontem';
  if (dias < 30) return `há ${dias} dias`;
  const meses = Math.floor(dias / 30);
  if (meses < 12) return `há ${meses} ${meses === 1 ? 'mês' : 'meses'}`;
  const anos = Math.floor(meses / 12);
  return `há ${anos} ${anos === 1 ? 'ano' : 'anos'}`;
}

export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function whatsappLink(numero) {
  if (!numero) return null;
  const digitos = numero.replace(/\D/g, '');
  const comPais = digitos.startsWith('55') ? digitos : `55${digitos}`;
  return `https://wa.me/${comPais}`;
}

// Mesma máscara usada no site institucional: (11) 91234-5678
export function mascararTelefone(valor) {
  const d = valor.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function aplicarMascaraTelefone(input) {
  input.addEventListener('input', () => {
    input.value = mascararTelefone(input.value);
  });
}

// Mapeia status_calculado / status_relacionamento para classe de badge
export function statusBadgeClasse(status) {
  const mapa = {
    'Lead': 'dot-info',
    'Cliente Ativo': 'dot-sucesso',
    'Cliente Recorrente': 'dot-sucesso',
    'Cliente Inativo': 'dot-neutro',
  };
  return mapa[status] || 'dot-neutro';
}
