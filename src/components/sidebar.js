// ============================================================
// Sidebar — grupo único "CRM" (decisão da Fase 8A, seção 14.1).
// Cada item some se o papel não tiver "visualizar" no módulo
// correspondente. Isso é só conveniência de navegação — a
// proteção real está no RLS.
// ============================================================
import { podeVisualizar, podeVisualizarAlgum, logout } from '../lib/session.js';

const NAV_ITEMS = [
  { label: 'Dashboard', href: 'dashboard.html', modulos: ['dashboard'], mobileIcon: '⌂' },
  // Busca so consulta tabelas que o usuario ja tem RLS pra ver -- nao
  // precisa de gate de permissao proprio, sem modulos.
  { label: 'Busca', href: 'busca.html', modulos: [] },
  { label: 'Clientes', href: 'clientes.html', modulos: ['leads', 'clientes'], mobileIcon: '☺' },
  { label: 'Pipeline', href: 'pipeline.html', modulos: ['pipeline', 'oportunidades'], mobileIcon: '◧' },
  { label: 'Contratos', href: 'contratos.html', modulos: ['contratos'] },
  { label: 'Tarefas', href: 'tarefas.html', modulos: ['tarefas'], mobileIcon: '✓' },
  { label: 'Agenda', href: 'agenda.html', modulos: ['agenda'], mobileIcon: '▦' },
  { label: 'Projetos', href: 'projetos.html', modulos: ['projetos'] },
  { label: 'Financeiro', href: 'financeiro.html', modulos: ['financeiro', 'caixa'] },
  { label: 'Recorrências', href: 'recorrencias.html', modulos: ['financeiro', 'contratos'] },
  { label: 'Gestão', href: 'gestao.html', modulos: ['gestao'] },
  { label: 'Configurações', href: 'configuracoes.html', modulos: ['configuracoes', 'usuarios', 'permissoes'] },
];

// os 5 itens promovidos ao menu mobile, conforme Fase 8A resposta #3
const MOBILE_PRIORITY = ['dashboard.html', 'clientes.html', 'pipeline.html', 'tarefas.html', 'agenda.html'];

export function renderSidebar(container, { perm, usuarioNome, papelNome, paginaAtual }) {
  const itensVisiveis = NAV_ITEMS.filter((item) => item.modulos.length === 0 || podeVisualizarAlgum(perm, item.modulos));

  const linksHtml = itensVisiveis
    .map((item) => {
      const ativo = item.href === paginaAtual ? 'active' : '';
      return `<a class="sidebar-link ${ativo}" href="/${item.href}">${item.label}</a>`;
    })
    .join('');

  const mobileLinksHtml = itensVisiveis
    .filter((item) => MOBILE_PRIORITY.includes(item.href))
    .map((item) => {
      const ativo = item.href === paginaAtual ? 'active' : '';
      return `<a class="${ativo}" href="/${item.href}"><span class="icon">${item.mobileIcon || '•'}</span>${item.label}</a>`;
    })
    .join('');

  container.innerHTML = `
    <aside class="sidebar">
      <div class="sidebar-brand"><a href="/hub.html" title="Trocar de empresa" style="color:inherit; text-decoration:none; display:flex; align-items:center; gap:10px;"><img src="/logo.png" alt="" style="height:28px; width:auto;" /><span>CRIATIVAMENTE<span class="dot">.</span></span></a></div>
      <div class="sidebar-group-label mono-label">CRM</div>
      <nav class="sidebar-nav">${linksHtml}</nav>
      <div class="sidebar-footer">
        <div class="user-name">${usuarioNome || 'Usuário'}</div>
        <div class="role-badge badge dot-neutro">${papelNome || '—'}</div>
        <div class="mt-2"><button class="btn-ghost" id="logoutBtn" style="padding:0; font-family:var(--font-mono); font-size:11px; text-decoration:underline;">Sair</button></div>
      </div>
    </aside>
    <nav class="mobile-tabbar">${mobileLinksHtml}<button type="button" id="mobileMenuBtn" class="mobile-menu-btn"><span class="icon">☰</span>Menu</button></nav>
    <div class="mobile-menu-overlay" id="mobileMenuOverlay" hidden>
      <div class="mobile-menu-sheet">
        <div class="mobile-menu-header">
          <span class="mono-label">CRM</span>
          <button type="button" class="btn-ghost" id="mobileMenuClose">Fechar</button>
        </div>
        <nav class="mobile-menu-links"><a class="mobile-menu-link" href="/hub.html">← Trocar de empresa</a>${linksHtml.replace(/class="sidebar-link /g, 'class="mobile-menu-link ')}</nav>
        <div class="mobile-menu-footer">
          <div class="user-name">${usuarioNome || 'Usuário'}</div>
          <div class="role-badge badge dot-neutro">${papelNome || '—'}</div>
          <div class="mt-2"><button type="button" class="btn-ghost" id="mobileLogoutBtn" style="padding:0; font-family:var(--font-mono); font-size:12px; text-decoration:underline;">Sair</button></div>
        </div>
      </div>
    </div>
  `;

  container.querySelector('#logoutBtn').addEventListener('click', logout);
  container.querySelector('#mobileLogoutBtn').addEventListener('click', logout);
  const overlay = container.querySelector('#mobileMenuOverlay');
  container.querySelector('#mobileMenuBtn').addEventListener('click', () => { overlay.hidden = false; });
  container.querySelector('#mobileMenuClose').addEventListener('click', () => { overlay.hidden = true; });
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.hidden = true; });
}

export function renderHeader(container, { breadcrumb, title }) {
  container.innerHTML = `
    <header class="header">
      <div>
        <div class="header-breadcrumb">${breadcrumb}</div>
        <div class="header-title">${title}</div>
      </div>
    </header>
  `;
}
