import { supabase } from './supabaseClient.js';
import { escapeHtml } from './format.js';
import { CATALOGO_FONTES, renderizarWidget, widgetsPadrao } from './painel.js';

export async function montarPainel({ containerId, pagina, empresaId, usuarioId, podeEditar }) {
  const raiz = document.getElementById(containerId);
  raiz.innerHTML = `
    <div class="filter-bar">
      <div class="spacer"></div>
      ${podeEditar ? `<button class="btn btn-secondary btn-sm" id="btnPersonalizar-${pagina}">Personalizar</button>` : ''}
    </div>
    <div class="painel-grid" id="painelGrid-${pagina}"></div>
  `;

  let emEdicao = false;
  let widgets = [];

  async function carregarWidgets() {
    const { data, error } = await supabase.from('paineis_widgets').select('*').eq('empresa_id', empresaId).eq('usuario_id', usuarioId).eq('pagina', pagina).order('ordem');
    if (error) { widgets = []; return; }

    if (!data || data.length === 0) {
      const padrao = widgetsPadrao(pagina);
      const inseridos = [];
      for (let i = 0; i < padrao.length; i++) {
        const { data: novo } = await supabase.from('paineis_widgets').insert({ empresa_id: empresaId, usuario_id: usuarioId, pagina, ordem: i, ...padrao[i] }).select('*').single();
        if (novo) inseridos.push(novo);
      }
      widgets = inseridos;
    } else {
      widgets = data;
    }
  }

  async function desenhar() {
    const grid = document.getElementById(`painelGrid-${pagina}`);
    grid.innerHTML = widgets.map((w) => `
      <div class="painel-bloco" data-id="${w.id}" style="grid-column: span ${w.largura};" draggable="${emEdicao}">
        <div class="painel-bloco-header">
          <span class="painel-bloco-titulo">${escapeHtml(w.titulo)}</span>
          ${emEdicao ? `<button class="btn-icone btn-remover-widget" data-id="${w.id}" title="Remover">✕</button>` : ''}
        </div>
        <div class="painel-bloco-corpo" id="corpo-widget-${w.id}"><div class="skeleton" style="height:80px;"></div></div>
      </div>
    `).join('') + (emEdicao ? `<div class="painel-bloco painel-bloco-add" style="grid-column: span 6;" id="btnAdicionarBloco-${pagina}">+ Adicionar bloco</div>` : '');

    widgets.forEach((w) => {
      const corpo = document.getElementById(`corpo-widget-${w.id}`);
      if (corpo) renderizarWidget(corpo, w, empresaId);
    });

    if (emEdicao) ativarInteracoesEdicao(grid);
  }

  function ativarInteracoesEdicao(grid) {
    grid.querySelectorAll('.btn-remover-widget').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await supabase.from('paineis_widgets').delete().eq('id', btn.dataset.id);
        widgets = widgets.filter((w) => w.id !== btn.dataset.id);
        await desenhar();
      });
    });

    const btnAdd = document.getElementById(`btnAdicionarBloco-${pagina}`);
    if (btnAdd) btnAdd.addEventListener('click', () => abrirPickerNovoWidget());

    let idArrastando = null;
    grid.querySelectorAll('.painel-bloco[draggable="true"]').forEach((bloco) => {
      bloco.addEventListener('dragstart', () => { idArrastando = bloco.dataset.id; });
      bloco.addEventListener('dragover', (e) => e.preventDefault());
      bloco.addEventListener('drop', async (e) => {
        e.preventDefault();
        const idDestino = bloco.dataset.id;
        if (!idArrastando || idArrastando === idDestino) return;
        const idxOrigem = widgets.findIndex((w) => w.id === idArrastando);
        const idxDestino = widgets.findIndex((w) => w.id === idDestino);
        const [item] = widgets.splice(idxOrigem, 1);
        widgets.splice(idxDestino, 0, item);
        await Promise.all(widgets.map((w, i) => supabase.from('paineis_widgets').update({ ordem: i }).eq('id', w.id)));
        await desenhar();
      });
    });
  }

  function abrirPickerNovoWidget() {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.6); display:flex; align-items:center; justify-content:center; z-index:100;';
    overlay.innerHTML = `
      <div class="card" style="width:100%; max-width:400px;">
        <div class="flex items-center justify-between mb-4">
          <span class="mono-label">Adicionar Bloco</span>
          <button class="btn-ghost" id="btnFecharPicker">Fechar</button>
        </div>
        <div class="field">
          <label class="mono-label">Fonte de dados</label>
          <select id="pkFonte">${Object.keys(CATALOGO_FONTES).map((f) => `<option value="${f}">${escapeHtml(CATALOGO_FONTES[f].titulo)}</option>`).join('')}</select>
        </div>
        <div class="field">
          <label class="mono-label">Formato</label>
          <select id="pkTipoVisual"></select>
        </div>
        <div class="field">
          <label class="mono-label">Título</label>
          <input type="text" id="pkTitulo" />
        </div>
        <div class="field">
          <label class="mono-label">Largura</label>
          <select id="pkLargura">
            <option value="4">Pequeno (1/3)</option>
            <option value="6" selected>Médio (1/2)</option>
            <option value="12">Grande (tela toda)</option>
          </select>
        </div>
        <button class="btn btn-primary btn-block" id="btnConfirmarAdd">Adicionar</button>
      </div>
    `;
    document.body.appendChild(overlay);

    function atualizarTiposPermitidos() {
      const fonte = document.getElementById('pkFonte').value;
      const def = CATALOGO_FONTES[fonte];
      document.getElementById('pkTipoVisual').innerHTML = def.tiposPermitidos.map((t) => `<option value="${t}">${t}</option>`).join('');
      document.getElementById('pkTitulo').value = def.titulo;
    }
    atualizarTiposPermitidos();
    document.getElementById('pkFonte').addEventListener('change', atualizarTiposPermitidos);
    document.getElementById('btnFecharPicker').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    document.getElementById('btnConfirmarAdd').addEventListener('click', async () => {
      const payload = {
        empresa_id: empresaId, usuario_id: usuarioId, pagina,
        fonte_dados: document.getElementById('pkFonte').value,
        tipo_visual: document.getElementById('pkTipoVisual').value,
        titulo: document.getElementById('pkTitulo').value.trim() || 'Bloco',
        largura: Number(document.getElementById('pkLargura').value),
        ordem: widgets.length,
      };
      const { data: novo, error } = await supabase.from('paineis_widgets').insert(payload).select('*').single();
      overlay.remove();
      if (!error && novo) { widgets.push(novo); await desenhar(); }
    });
  }

  if (podeEditar) {
    document.getElementById(`btnPersonalizar-${pagina}`).addEventListener('click', async (e) => {
      emEdicao = !emEdicao;
      e.target.textContent = emEdicao ? 'Concluir' : 'Personalizar';
      await desenhar();
    });
  }

  await carregarWidgets();
  await desenhar();
}
