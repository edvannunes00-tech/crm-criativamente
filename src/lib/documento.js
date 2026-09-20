// Validacao e mascara de CPF/CNPJ (inclui o CNPJ alfanumerico, valido desde julho de 2026).
// Espelha supabase/functions/_shared/documento.ts. Mantenha as duas iguais.
export function normalizarDocumento(valor) {
  return String(valor ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function cpfValido(d) {
  if (!/^\d{11}$/.test(d) || /^(\d)\1{10}$/.test(d)) return false;
  for (const tam of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < tam; i++) soma += Number(d[i]) * (tam + 1 - i);
    const dv = (soma * 10) % 11 % 10;
    if (dv !== Number(d[tam])) return false;
  }
  return true;
}

function cnpjValido(d) {
  if (!/^[A-Z0-9]{12}[0-9]{2}$/.test(d) || /^(.)\1{13}$/.test(d)) return false;
  const valor = (c) => c.charCodeAt(0) - 48;
  const pesos1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const pesos2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const digito = (pesos) => {
    const soma = pesos.reduce((t, p, i) => t + valor(d[i]) * p, 0);
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return digito(pesos1) === Number(d[12]) && digito(pesos2) === Number(d[13]);
}

export function validarDocumento(valor) {
  const n = normalizarDocumento(valor);
  if (n.length === 11 && /^\d+$/.test(n)) return { ok: cpfValido(n), tipo: 'cpf', normalizado: n };
  if (n.length === 14) return { ok: cnpjValido(n), tipo: 'cnpj', normalizado: n };
  return { ok: false, tipo: null, normalizado: n };
}

// Mascara enquanto digita: ate 11 digitos = CPF; passou disso (ou tem letra) = CNPJ.
export function mascararDocumento(valor) {
  const c = normalizarDocumento(valor).slice(0, 14);
  if (c.length <= 11 && /^\d*$/.test(c)) {
    const [a, b, d, e] = [c.slice(0, 3), c.slice(3, 6), c.slice(6, 9), c.slice(9, 11)];
    return `${a}${b ? '.' + b : ''}${d ? '.' + d : ''}${e ? '-' + e : ''}`;
  }
  const [a, b, d, e, f] = [c.slice(0, 2), c.slice(2, 5), c.slice(5, 8), c.slice(8, 12), c.slice(12, 14)];
  return `${a}${b ? '.' + b : ''}${d ? '.' + d : ''}${e ? '/' + e : ''}${f ? '-' + f : ''}`;
}
