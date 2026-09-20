// Validacao de CPF e CNPJ (inclui o CNPJ alfanumerico, valido desde julho de 2026).
// Espelhada em src/lib/documento.js (navegador). Mantenha as duas iguais.
export function normalizarDocumento(valor: string): string {
  return String(valor ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function cpfValido(d: string): boolean {
  if (!/^\d{11}$/.test(d) || /^(\d)\1{10}$/.test(d)) return false;
  for (const tam of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < tam; i++) soma += Number(d[i]) * (tam + 1 - i);
    const dv = (soma * 10) % 11 % 10;
    if (dv !== Number(d[tam])) return false;
  }
  return true;
}

function cnpjValido(d: string): boolean {
  if (!/^[A-Z0-9]{12}[0-9]{2}$/.test(d) || /^(.)\1{13}$/.test(d)) return false;
  const valor = (c: string) => c.charCodeAt(0) - 48;
  const pesos1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const pesos2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const digito = (pesos: number[]) => {
    const soma = pesos.reduce((t, p, i) => t + valor(d[i]) * p, 0);
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return digito(pesos1) === Number(d[12]) && digito(pesos2) === Number(d[13]);
}

export function validarDocumento(valor: string): { ok: boolean; tipo: "cpf" | "cnpj" | null; normalizado: string } {
  const n = normalizarDocumento(valor);
  if (n.length === 11 && /^\d+$/.test(n)) return { ok: cpfValido(n), tipo: "cpf", normalizado: n };
  if (n.length === 14) return { ok: cnpjValido(n), tipo: "cnpj", normalizado: n };
  return { ok: false, tipo: null, normalizado: n };
}
