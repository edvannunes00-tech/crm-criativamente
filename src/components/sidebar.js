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
  { label: 'Gestão', href: 'gestao.html', modulos: ['gestao'] },
  { label: 'Configurações', href: 'configuracoes.html', modulos: ['configuracoes', 'usuarios', 'permissoes'] },
  // PromoWhats: módulo próprio (mineração Shopee + publicação WhatsApp),
  // dados isolados no schema afiliados (RLS + allowlist própria, não a
  // matriz crm.papel_permissoes) — por isso sem `modulos` aqui: não cria
  // dependência de nenhuma tabela do schema crm.
  { label: 'PromoWhats', href: 'afiliados/dashboard.html', modulos: [] },
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
