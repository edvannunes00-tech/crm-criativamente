import { supabase } from './supabaseClient.js';
import { formatarMoeda, escapeHtml } from './format.js';

// ============================================================
// CATÁLOGO DE FONTES DE DADOS DISPONÍVEIS
// Cada fonte já existia no banco (funções/views validadas nas
// Fases 5 e 6) — aqui só descrevemos o FORMATO pra saber que
// tipo de visual cada uma aceita.
// ============================================================
export const CATALOGO_FONTES = {
  resumo_financeiro: { titulo: 'Resumo Financeiro (mês atual)', tipo: 'metricas', tiposPermitidos: ['card', 'tabela'], precisaPeriodo: true },
  indicadores_comerciais: { titulo: 'Indicadores Comerciais (mês atual)', tipo: 'metricas', tiposPermitidos: ['card', 'tabela'], precisaPeriodo: true },
  indicadores_clientes: { titulo: 'Indicadores de Clientes (mês atual)', tipo: 'metricas', tiposPermitidos: ['card', 'tabela'], precisaPeriodo: true },
  indicadores_projetos: { titulo: 'Indicadores de Projetos', tipo: 'metricas', tiposPermitidos: ['card', 'tabela'] },
  funil_conversao: { titulo: 'Funil de Conversão (mês atual)', tipo: 'serie', tiposPermitidos: ['tabela', 'barra', 'pizza', 'funil'], rotulo: 'etapa', valor: 'quantidade', precisaPeriodo: true },
  apontamentos_gerenciais: { titulo: 'Apontamentos', tipo: 'lista', tiposPermitidos: ['texto', 'tabela'] },
  atencao_hoje: { titulo: 'Precisa de Atenção Agora', tipo: 'lista', tiposPermitidos: ['texto', 'tabela'] },
};

const CAMPO_LABEL = {
  faturamento: 'Faturamento', recebido: 'Recebido', a_receber: 'A Receber', despesas_total: 'Despesas',
  ebitda: 'EBITDA', lucro_gerencial: 'Lucro Gerencial', taxas_total: 'Taxas', impostos_estimados: 'Impostos Est.',
  total_criadas: 'Criadas', total_ganhas: 'Ganhas', total_perdidas: 'Perdidas', taxa_conversao_percentual: 'Taxa Conversão',
  ticket_medio: 'Ticket Médio', ciclo_venda_medio_dias: 'Ciclo Médio (dias)', valor_total_ganho: 'Valor Ganho',
  novos_clientes: 'Novos Clientes', total_clientes: 'Total Clientes', clientes_ativos: 'Ativos',
  clientes_recorrentes: 'Recorrentes', clientes_inativos: 'Inativos', ltv_medio: 'LTV Médio', taxa_recompra_percentual: 'Taxa Recompra',
  projetos_ativos: 'Ativos', projetos_concluidos: 'Concluídos', projetos_atrasados: 'Atrasados', tempo_medio_etapa_dias: 'Tempo Médio/Etapa (dias)',
};
const CAMPOS_MOEDA = new Set(['faturamento', 'recebido', 'a_receber', 'despesas_total', 'ebitda', 'lucro_gerencial', 'taxas_total', 'impostos_estimados', 'valor_total_ganho', 'ticket_medio', 'ltv_medio']);
const CAMPOS_PERCENT = new Set(['taxa_conversao_percentual', 'taxa_recompra_percentual', 'margem_ebitda', 'margem_liquida']);

function mesAtual() {
  const hoje = new Date();
  return { inicio: new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0, 10), fim: hoje.toISOString().slice(0, 10) };
}

// Busca os dados de uma fonte e devolve num formato normalizado:
// { tipo: 'metricas', linha: {...} } | { tipo: 'serie', linhas: [...] } | { tipo: 'lista', itens: [...] } | { erro: '...' }
export async function buscarDadosFonte(fonte, empresaId) {
  const def = CATALOGO_FONTES[fonte];
  if (!def) return { erro: 'Fonte desconhecida' };
  const { inicio, fim } = mesAtual();

  try {
    if (fonte === 'resumo_financeiro') {
      const { data, error } = await supabase.rpc('resumo_financeiro', { p_empresa_id: empresaId, p_data_inicio: inicio, p_data_fim: fim });
      if (error) throw error;
      return { tipo: 'metricas', linha: (data && data[0]) || {} };
    }
    if (fonte === 'indicadores_comerciais') {
      const { data, error } = await supabase.rpc('indicadores_comerciais', { p_empresa_id: empresaId, p_data_inicio: inicio, p_data_fim: fim });
      if (error) throw error;
      return { tipo: 'metricas', linha: (data && data[0]) || {} };
    }
    if (fonte === 'indicadores_clientes') {
      const { data, error } = await supabase.rpc('indicadores_clientes', { p_empresa_id: empresaId, p_data_inicio: inicio, p_data_fim: fim });
      if (error) throw error;
      return { tipo: 'metricas', linha: (data && data[0]) || {} };
    }
    if (fonte === 'indicadores_projetos') {
      const { data, error } = await supabase.rpc('indicadores_projetos', { p_empresa_id: empresaId });
      if (error) throw error;
      return { tipo: 'metricas', linha: (data && data[0]) || {} };
    }
    if (fonte === 'funil_conversao') {
      const { data, error } = await supabase.rpc('funil_conversao', { p_empresa_id: empresaId, p_data_inicio: inicio, p_data_fim: fim });
      if (error) throw error;
      return { tipo: 'serie', linhas: data || [] };
    }
    if (fonte === 'apontamentos_gerenciais') {
      const { data, error } = await supabase.rpc('apontamentos_gerenciais', { p_empresa_id: empresaId });
      if (error) throw error;
      return { tipo: 'lista', itens: (data || []).map((a) => ({ titulo: a.titulo, detalhe: a.detalhe, prioridade: a.prioridade })) };
    }
    if (fonte === 'atencao_hoje') {
      const { data, error } = await supabase.from('vw_gestao_atencao').select('*').limit(20);
      if (error) throw error;
      return { tipo: 'lista', itens: (data || []).map((a) => ({ titulo: a.titulo || a.descricao, detalhe: a.detalhe, prioridade: a.prioridade })) };
    }
  } catch (e) {
    return { erro: e.message || 'Não foi possível carregar esta fonte agora.' };
  }
  return { erro: 'Fonte não implementada' };
}

function valorFormatado(campo, valor) {
  if (valor === null || valor === undefined) return '—';
  if (CAMPOS_MOEDA.has(campo)) return formatarMoeda(valor);
  if (CAMPOS_PERCENT.has(campo)) return `${valor}%`;
  return String(valor);
}

let chartJsPromise = null;
async function carregarChartJs() {
  if (!chartJsPromise) chartJsPromise = import('https://esm.sh/chart.js@4/auto');
  const mod = await chartJsPromise;
  return mod.default || mod.Chart || mod;
}

const CORES = ['#9CFF19', '#4C8DFF', '#FFB020', '#E8654A', '#B084F0', '#2FD3C7', '#F06AA8'];

// Renderiza um widget dentro do elemento `container`, de acordo com
// o tipo_visual escolhido. Cuida sozinho de pedir os dados.
export async function renderizarWidget(container, widget, empresaId) {
  const resultado = await buscarDadosFonte(widget.fonte_dados, empresaId);

  if (resultado.erro) {
    container.innerHTML = `<div class="error-state" style="padding:16px;"><p style="font-size:12.5px;">${escapeHtml(resultado.erro)}</p></div>`;
    return;
  }

  if (widget.tipo_visual === 'card') {
    if (resultado.tipo !== 'metricas') { container.innerHTML = vazioIncompativel(); return; }
    const campos = Object.keys(resultado.linha).filter((c) => CAMPO_LABEL[c]);
    container.innerHTML = `
      <div class="widget-metricas-grid">
        ${campos.map((c) => `
          <div class="widget-metrica">
            <div class="label mono-label">${CAMPO_LABEL[c]}</div>
            <div class="value">${valorFormatado(c, resultado.linha[c])}</div>
          </div>
        `).join('')}
      </div>
    `;
    return;
  }

  if (widget.tipo_visual === 'tabela') {
    let linhas = [];
    if (resultado.tipo === 'metricas') linhas = Object.keys(resultado.linha).filter((c) => CAMPO_LABEL[c]).map((c) => ({ rotulo: CAMPO_LABEL[c], valor: valorFormatado(c, resultado.linha[c]) }));
    else if (resultado.tipo === 'serie') {
      const def = CATALOGO_FONTES[widget.fonte_dados];
      linhas = resultado.linhas.map((l) => ({ rotulo: l[def.rotulo], valor: l[def.valor] }));
    } else if (resultado.tipo === 'lista') {
      linhas = resultado.itens.map((i) => ({ rotulo: i.titulo, valor: i.detalhe || '' }));
    }
    container.innerHTML = linhas.length === 0
      ? `<div class="empty-state" style="padding:16px;"><p style="font-size:12.5px;">Sem dados no momento.</p></div>`
      : `<table class="data-table"><tbody>${linhas.map((l) => `<tr><td class="cell-primary">${escapeHtml(String(l.rotulo))}</td><td style="text-align:right;">${escapeHtml(String(l.valor))}</td></tr>`).join('')}</tbody></table>`;
    return;
  }

  if (widget.tipo_visual === 'texto') {
    if (resultado.tipo !== 'lista') { container.innerHTML = vazioIncompativel(); return; }
    container.innerHTML = resultado.itens.length === 0
      ? `<div class="empty-state" style="padding:16px;"><div class="icon">✓</div><p style="font-size:12.5px;">Nada por aqui.</p></div>`
      : resultado.itens.map((i) => `<div class="apontamento ${i.prioridade || ''}"><div><div class="titulo">${escapeHtml(i.titulo)}</div>${i.detalhe ? `<div class="detalhe">${escapeHtml(i.detalhe)}</div>` : ''}</div></div>`).join('');
    return;
  }

  // pizza / barra / linha / funil -> precisam de série (categoria + valor)
  if (resultado.tipo !== 'serie') { container.innerHTML = vazioIncompativel(); return; }
  if (resultado.linhas.length === 0) { container.innerHTML = `<div class="empty-state" style="padding:16px;"><p style="font-size:12.5px;">Sem dados no momento.</p></div>`; return; }

  const def = CATALOGO_FONTES[widget.fonte_dados];
  const rotulos = resultado.linhas.map((l) => l[def.rotulo]);
  const valores = resultado.linhas.map((l) => l[def.valor]);

  const Chart = await carregarChartJs();
  container.innerHTML = `<canvas></canvas>`;
  const canvas = container.querySelector('canvas');

  if (widget.tipo_visual === 'funil') {
    // aproximação de funil: barras horizontais em ordem decrescente
    const pares = rotulos.map((r, i) => ({ r, v: valores[i] })).sort((a, b) => b.v - a.v);
    new Chart(canvas, {
      type: 'bar',
      data: { labels: pares.map((p) => p.r), datasets: [{ data: pares.map((p) => p.v), backgroundColor: CORES[0] }] },
      options: { indexAxis: 'y', plugins: { legend: { display: false } }, responsive: true, maintainAspectRatio: false },
    });
    return;
  }

  const tipoChart = widget.tipo_visual === 'pizza' ? 'pie' : widget.tipo_visual === 'linha' ? 'line' : 'bar';
  new Chart(canvas, {
    type: tipoChart,
    data: { labels: rotulos, datasets: [{ data: valores, backgroundColor: CORES, borderColor: CORES[0] }] },
    options: { plugins: { legend: { display: tipoChart === 'pie' } }, responsive: true, maintainAspectRatio: false },
  });
}

function vazioIncompativel() {
  return `<div class="empty-state" style="padding:16px;"><p style="font-size:12.5px;">Esse tipo de visual não é compatível com essa fonte de dados.</p></div>`;
}

// Cria o conjunto padrão de widgets pra um painel novo (usado tanto no
// primeiro painel automático quanto quando a pessoa cria um painel do zero)
export function widgetsPadrao(pagina) {
  if (pagina === 'dashboard') {
    return [
      { titulo: 'Precisa de Atenção Agora', fonte_dados: 'atencao_hoje', tipo_visual: 'texto', largura: 12, ordem: 0 },
      { titulo: 'Indicadores Comerciais', fonte_dados: 'indicadores_comerciais', tipo_visual: 'card', largura: 6, ordem: 1 },
      { titulo: 'Indicadores de Clientes', fonte_dados: 'indicadores_clientes', tipo_visual: 'card', largura: 6, ordem: 2 },
      { titulo: 'Funil de Conversão', fonte_dados: 'funil_conversao', tipo_visual: 'barra', largura: 12, ordem: 3 },
    ];
  }
  return [
    { titulo: 'Indicadores Comerciais', fonte_dados: 'indicadores_comerciais', tipo_visual: 'card', largura: 12, ordem: 0 },
    { titulo: 'Funil de Conversão', fonte_dados: 'funil_conversao', tipo_visual: 'barra', largura: 6, ordem: 1 },
    { titulo: 'Apontamentos', fonte_dados: 'apontamentos_gerenciais', tipo_visual: 'texto', largura: 6, ordem: 2 },
  ];
}
