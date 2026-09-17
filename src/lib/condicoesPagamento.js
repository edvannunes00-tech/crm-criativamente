// ============================================================
// Constantes centralizadas de condição/forma de pagamento do
// contrato — único lugar que conhece as opções, pra não espalhar
// essa regra de negócio pelo frontend. Extensível: adicionar uma
// opção nova é só adicionar uma linha aqui.
// ============================================================

export const CONDICOES_PAGAMENTO = [
  { valor: 'avista', label: 'À vista' },
  { valor: 'sinal_saldo', label: 'Sinal + saldo' },
  { valor: 'parcelado_semanal', label: 'Parcelado semanal' },
  { valor: 'parcelado_mensal', label: 'Parcelado mensal' },
  { valor: 'cinquenta_gravacao_entrega', label: '50% na gravação + 50% na entrega' },
  { valor: 'cinquenta_contratacao_entrega', label: '50% na contratação + 50% na entrega' },
  { valor: 'personalizado', label: 'Personalizado' },
];

export const PERCENTUAIS_ENTRADA_PRESET = [10, 20, 30, 50];

export const FORMAS_PAGAMENTO = [
  { valor: 'pix', label: 'Pix' },
  { valor: 'cartao', label: 'Cartão' },
  { valor: 'pix_parcelado', label: 'Pix parcelado' },
  { valor: 'dinheiro', label: 'Dinheiro' },
  { valor: 'transferencia', label: 'Transferência' },
  { valor: 'outro', label: 'Outro' },
];

export const PERIODICIDADES = [
  { valor: 'semanal', label: 'Semanal' },
  { valor: 'mensal', label: 'Mensal' },
];

function labelDe(lista, valor) {
  return (lista.find((o) => o.valor === valor) || {}).label || valor;
}

// Monta o texto-resumo (o que continua sendo salvo em
// condicoes_pagamento_texto, lido pelo PDF e pela página pública sem
// nenhuma mudança nesses dois lugares) a partir dos campos estruturados.
export function montarResumoCondicaoPagamento({
  condicaoTipo, percentualEntrada, formaPagamento, formaPagamentoOutro,
  parcelasQuantidade, parcelasPeriodicidade, parcelasObservacao, textoPersonalizado,
}) {
  const partes = [];

  if (condicaoTipo === 'personalizado') {
    if (textoPersonalizado) partes.push(textoPersonalizado);
  } else if (condicaoTipo === 'sinal_saldo' && percentualEntrada) {
    const saldo = 100 - Number(percentualEntrada);
    partes.push(`Sinal de ${percentualEntrada}% + saldo de ${saldo}%`);
  } else if (condicaoTipo) {
    partes.push(labelDe(CONDICOES_PAGAMENTO, condicaoTipo));
  }

  if ((condicaoTipo === 'parcelado_semanal' || condicaoTipo === 'parcelado_mensal') && parcelasQuantidade) {
    partes.push(`em ${parcelasQuantidade}x ${labelDe(PERIODICIDADES, parcelasPeriodicidade || (condicaoTipo === 'parcelado_semanal' ? 'semanal' : 'mensal')).toLowerCase()}`);
  } else if (parcelasQuantidade) {
    partes.push(`${parcelasQuantidade}x`);
  }
  if (parcelasObservacao) partes.push(parcelasObservacao);

  if (formaPagamento) {
    const formaLabel = formaPagamento === 'outro' ? (formaPagamentoOutro || 'Outro') : labelDe(FORMAS_PAGAMENTO, formaPagamento);
    partes.push(`— forma: ${formaLabel}`);
  }

  return partes.join(' ').trim() || null;
}
