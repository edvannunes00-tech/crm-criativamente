// ============================================================
// Sidebar — grupo único "CRM" (decisão da Fase 8A, seção 14.1).
// Cada item some se o papel não tiver "visualizar" no módulo
// correspondente. Isso é só conveniência de navegação — a
// proteção real está no RLS.
// ============================================================
import { podeVisualizar, podeVisualizarAlgum, logout } from '../lib/session.js';

const NAV_ITEMS = [
  { label: 'Dashboard', href: 'dashboard.html', modulos: ['dashboard'], mobileIcon: '⌂' },
  { label: 'Clientes', href: 'clientes.html', modulos: ['leads', 'clientes'], mobileIcon: '☺' },
  { label: 'Pipeline', href: 'pipeline.html', modulos: ['pipeline', 'oportunidades'], mobileIcon: '◧' },
  { label: 'Tarefas', href: 'tarefas.html', modulos: ['tarefas'], mobileIcon: '✓' },
  { label: 'Agenda', href: 'agenda.html', modulos: ['agenda'], mobileIcon: '▦' },
  { label: 'Projetos', href: 'projetos.html', modulos: ['projetos'] },
  { label: 'Financeiro', href: 'financeiro.html', modulos: ['financeiro', 'caixa'] },
  { label: 'Gestão', href: 'gestao.html', modulos: ['gestao'] },
  { label: 'Configurações', href: 'configuracoes.html', modulos: ['configuracoes', 'usuarios', 'permissoes'] },
];

// os 5 itens promovidos ao menu mobile, conforme Fase 8A resposta #3
const MOBILE_PRIORITY = ['dashboard.html', 'clientes.html', 'pipeline.html', 'tarefas.html', 'agenda.html'];

export function renderSidebar(container, { perm, usuarioNome, papelNome, paginaAtual }) {
  const itensVisiveis = NAV_ITEMS.filter((item) => podeVisualizarAlgum(perm, item.modulos));

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
      <div class="sidebar-brand"><span>CRIATIVAMENTE<span class="dot">.</span></span></div>
      <div class="sidebar-group-label mono-label">CRM</div>
      <nav class="sidebar-nav">${linksHtml}</nav>
      <div class="sidebar-footer">
        <div class="user-name">${usuarioNome || 'Usuário'}</div>
        <div class="role-badge badge dot-neutro">${papelNome || '—'}</div>
        <div class="mt-2"><button class="btn-ghost" id="logoutBtn" style="padding:0; font-family:var(--font-mono); font-size:11px; text-decoration:underline;">Sair</button></div>
      </div>
    </aside>
    <nav class="mobile-tabbar">${mobileLinksHtml}</nav>
  `;

  container.querySelector('#logoutBtn').addEventListener('click', logout);
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
