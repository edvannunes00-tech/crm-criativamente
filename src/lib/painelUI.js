import { supabase } from './supabaseClient.js';
import { escapeHtml } from './format.js';
import { CATALOGO_FONTES, renderizarWidget, widgetsPadrao } from './painel.js';

export async function montarPainel({ containerId, pagina, empresaId, usuarioId, meuPapelId }) {
  const raiz = document.getElementById(containerId);
  raiz.innerHTML = `
    <div class="filter-bar" id="paineisTabs-${pagina}"></div>
    <div id="painelAtivoArea-${pagina}"><div class="skeleton" style="height:200px;"></div></div>
  `;

  let paineis = [];
  let painelAtivoId = null;
  let widgets = [];
  let emEdicao = false;

  async function carregarPaineis() {
    const { data, error } = await supabase.from('paineis').select('*').eq('empresa_id', empresaId).eq('pagina', pagina).order('created_at');
    if (error) { paineis = []; return; }

    if (!data || data.length === 0) {
      const nomeInicial = pagina === 'dashboard' ? 'Meu Dashboard' : 'Minha Gestão';
      const { data: novoPainel } = await supabase.from('paineis').insert({ empresa_id: empresaId, usuario_id: usuarioId, pagina, nome: nomeInicial }).select('*').single();
      if (novoPainel) {
        const padrao = widgetsPadrao(pagina);
        for (const w of padrao) await supabase.from('paineis_widgets').insert({ painel_id: novoPainel.id, ...w });
        paineis = [novoPainel];
      }
    } else {
      paineis = data;
    }
    painelAtivoId = paineis[0] ? paineis[0].id : null;
  }

  function desenharAbas() {
    const el = document.getElementById(`paineisTabs-${pagina}`);
    el.innerHTML = `
      <div class="tabs" style="border-bottom:none; margin-bottom:0;">
        ${paineis.map((p) => `<button class="tab ${p.id === painelAtivoId ? 'active' : ''}" data-id="${p.id}">${escapeHtml(p.nome)}${p.usuario_id !== usuarioId ? ' 👥' : ''}</button>`).join('')}
      </div>
      <div class="spacer"></div>
      <button class="btn btn-secondary btn-sm" id="btnNovoPainel-${pagina}">+ Novo Painel</button>
    `;
    el.querySelectorAll('.tab').forEach((btn) => {
      btn.addEventListener('click', () => { painelAtivoId = btn.dataset.id; emEdicao = false; desenharAbas(); carregarEDesenharWidgets(); });
    });
    document.getElementById(`btnNovoPainel-${pagina}`).addEventListener('click', criarNovoPainel);
  }

  async function criarNovoPainel() {
    const nome = prompt('Nome do novo painel (ex: "Apresentação Mensal"):');
    if (!nome || !nome.trim()) return;
    const { data: novo, error } = await supabase.from('paineis').insert({ empresa_id: empresaId, usuario_id: usuarioId, pagina, nome: nome.trim() }).select('*').single();
    if (error || !novo) { alert('Não foi possível criar o painel agora.'); return; }
    paineis.push(novo);
    painelAtivoId = novo.id;
    desenharAbas();
    await carregarEDesenharWidgets();
  }

  async function carregarWidgetsDoAtivo() {
    if (!painelAtivoId) { widgets = []; return; }
    const { data } = await supabase.from('paineis_widgets').select('*').eq('painel_id', painelAtivoId).order('ordem');
    widgets = data || [];
  }

  function painelAtivo() { return paineis.find((p) => p.id === painelAtivoId); }
  function souDono() { const p = painelAtivo(); return p && p.usuario_id === usuarioId; }

  async function possoEditarAtivo() {
    if (souDono()) return true;
    const { data } = await supabase.from('paineis_compartilhamentos').select('*').eq('painel_id', painelAtivoId);
    return (data || []).some((c) => c.pode_editar && (c.papel_id === null || c.papel_id === meuPapelId));
  }

  async function carregarEDesenharWidgets() {
    await carregarWidgetsDoAtivo();
    await desenharArea();
  }

  async function desenharArea() {
    const area = document.getElementById(`painelAtivoArea-${pagina}`);
    const p = painelAtivo();
    if (!p) { area.innerHTML = `<div class="empty-state"><p>Nenhum painel disponível.</p></div>`; return; }

    const dono = souDono();
    const podeEditarEste = await possoEditarAtivo();
    if (!podeEditarEste) emEdicao = false;

    area.innerHTML = `
      <div class="flex items-center justify-between mb-4">
        <div class="text-muted" style="font-size:12px;">${dono ? '' : 'Painel compartilhado com você — ' + (podeEditarEste ? 'você pode editar' : 'somente visualização')}</div>
        <div class="flex gap-2">
          ${dono ? `<button class="btn btn-secondary btn-sm" id="btnCompartilhar-${pagina}">Compartilhar</button>` : ''}
          ${dono && paineis.length > 1 ? `<button class="btn btn-secondary btn-sm" id="btnExcluirPainel-${pagina}" style="color:var(--status-erro);">Excluir painel</button>` : ''}
          ${podeEditarEste ? `<button class="btn btn-secondary btn-sm" id="btnPersonalizar-${pagina}">${emEdicao ? 'Concluir' : 'Personalizar'}</button>` : ''}
        </div>
      </div>
      <div class="painel-grid" id="painelGrid-${pagina}"></div>
    `;

    if (dono) {
      document.getElementById(`btnCompartilhar-${pagina}`).addEventListener('click', abrirModalCompartilhar);
      const btnExcluir = document.getElementById(`btnExcluirPainel-${pagina}`);
      if (btnExcluir) btnExcluir.addEventListener('click', excluirPainelAtivo);
    }
    const btnPersonalizar = document.getElementById(`btnPersonalizar-${pagina}`);
    if (btnPersonalizar) btnPersonalizar.addEventListener('click', async () => {
      emEdicao = !emEdicao;
      await desenharArea();
      await desenharGrid();
    });

    await desenharGrid();
  }

  async function desenharGrid() {
    const grid = document.getElementById(`painelGrid-${pagina}`);
    if (!grid) return;
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

    if (emEdicao) ativarInteracoesEdicaoGrid(grid);
  }

  function ativarInteracoesEdicaoGrid(grid) {
    grid.querySelectorAll('.btn-remover-widget').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await supabase.from('paineis_widgets').delete().eq('id', btn.dataset.id);
        widgets = widgets.filter((w) => w.id !== btn.dataset.id);
        await desenharGrid();
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
        await desenharGrid();
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
        painel_id: painelAtivoId,
        fonte_dados: document.getElementById('pkFonte').value,
        tipo_visual: document.getElementById('pkTipoVisual').value,
        titulo: document.getElementById('pkTitulo').value.trim() || 'Bloco',
        largura: Number(document.getElementById('pkLargura').value),
        ordem: widgets.length,
      };
      const { data: novo, error } = await supabase.from('paineis_widgets').insert(payload).select('*').single();
      overlay.remove();
      if (!error && novo) { widgets.push(novo); await desenharGrid(); }
    });
  }

  async function abrirModalCompartilhar() {
    const { data: papeis } = await supabase.from('papeis').select('id, nome').eq('empresa_id', empresaId);
    const { data: compartilhamentosAtuais } = await supabase.from('paineis_compartilhamentos').select('*').eq('painel_id', painelAtivoId);

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.6); display:flex; align-items:center; justify-content:center; z-index:100;';
    overlay.innerHTML = `
      <div class="card" style="width:100%; max-width:440px;">
        <div class="flex items-center justify-between mb-4">
          <span class="mono-label">Compartilhar Painel</span>
          <button class="btn-ghost" id="btnFecharCompartilhar">Fechar</button>
        </div>
        <div id="listaCompartilhamentos" class="mb-4"></div>
        <div class="field">
          <label class="mono-label">Compartilhar com o papel</label>
          <select id="cpPapel">
            <option value="">Todos da empresa</option>
            ${(papeis || []).map((p) => `<option value="${p.id}">${escapeHtml(p.nome)}</option>`).join('')}
          </select>
        </div>
        <div class="check-linha"><input type="checkbox" id="cpPodeEditar" /><label for="cpPodeEditar">Pode editar (senão, só visualiza)</label></div>
        <button class="btn btn-primary btn-block" id="btnAdicionarCompartilhamento">Adicionar</button>
      </div>
    `;
    document.body.appendChild(overlay);

    function renderizarLista(lista) {
      const el = document.getElementById('listaCompartilhamentos');
      const nomePapel = (id) => id ? ((papeis || []).find((p) => p.id === id)?.nome || '—') : 'Todos da empresa';
      el.innerHTML = lista.length === 0
        ? `<p class="text-muted" style="font-size:12.5px;">Ainda não compartilhado com ninguém.</p>`
        : lista.map((c) => `
          <div class="flex items-center justify-between mb-2" style="font-size:13px;">
            <span>${escapeHtml(nomePapel(c.papel_id))} — ${c.pode_editar ? 'pode editar' : 'só visualiza'}</span>
            <button class="btn-icone btn-remover-compartilhamento" data-id="${c.id}">✕</button>
          </div>
        `).join('');
      el.querySelectorAll('.btn-remover-compartilhamento').forEach((btn) => {
        btn.addEventListener('click', async () => {
          await supabase.from('paineis_compartilhamentos').delete().eq('id', btn.dataset.id);
          const { data: atualizados } = await supabase.from('paineis_compartilhamentos').select('*').eq('painel_id', painelAtivoId);
          renderizarLista(atualizados || []);
        });
      });
    }
    renderizarLista(compartilhamentosAtuais || []);

    document.getElementById('btnFecharCompartilhar').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    document.getElementById('btnAdicionarCompartilhamento').addEventListener('click', async () => {
      const papelId = document.getElementById('cpPapel').value || null;
      const podeEditar = document.getElementById('cpPodeEditar').checked;
      const { error } = await supabase.from('paineis_compartilhamentos').insert({ painel_id: painelAtivoId, papel_id: papelId, pode_editar: podeEditar });
      if (error) { alert('Já existe um compartilhamento pra esse papel, ou algo deu errado.'); return; }
      const { data: atualizados } = await supabase.from('paineis_compartilhamentos').select('*').eq('painel_id', painelAtivoId);
      renderizarLista(atualizados || []);
    });
  }

  async function excluirPainelAtivo() {
    if (!confirm(`Excluir o painel "${painelAtivo().nome}"? Os blocos dele também serão apagados.`)) return;
    await supabase.from('paineis').delete().eq('id', painelAtivoId);
    paineis = paineis.filter((p) => p.id !== painelAtivoId);
    painelAtivoId = paineis[0] ? paineis[0].id : null;
    desenharAbas();
    await carregarEDesenharWidgets();
  }

  await carregarPaineis();
  desenharAbas();
  await carregarEDesenharWidgets();
}
