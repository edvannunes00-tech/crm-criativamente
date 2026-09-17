// ============================================================
// Sidebar própria do módulo PromoWhats — visual off-white/teal,
// deliberadamente diferente do tema escuro do CRM (pedido do
// usuário: "sentir que entrou em um módulo diferente"). Reaproveita
// a MESMA sessão do CRM (logout importado de /src/lib/session.js,
// o arquivo real do CRM — não duplicado aqui).
// ============================================================
import { logout } from '/src/lib/session.js';
import { ICON_DASHBOARD, ICON_ESTOQUE, ICON_APROVAR, ICON_HISTORICO, ICON_CONFIG, ICON_METRICAS, ICON_BACK } from './icons.js';

const NAV_ITEMS = [
  { label: 'Dashboard', href: 'dashboard.html', icon: ICON_DASHBOARD },
  { label: 'Estoque', href: 'estoque.html', icon: ICON_ESTOQUE },
  { label: 'Aprovar / rejeitar', href: 'aprovar.html', icon: ICON_APROVAR },
  { label: 'Histórico', href: 'historico.html', icon: ICON_HISTORICO },
  { label: 'Configuração', href: 'configuracao.html', icon: ICON_CONFIG },
  { label: 'Métricas', href: 'metricas.html', icon: ICON_METRICAS },
];

export function renderSidebar(container, { paginaAtual, usuarioEmail }) {
  const linksHtml = NAV_ITEMS.map((item) => {
    const ativo = item.href === paginaAtual ? 'active' : '';
    return `<a class="sidebar-link ${ativo}" href="/afiliados/${item.href}">${item.icon}${item.label}</a>`;
  }).join('');

  container.innerHTML = `
    <aside class="sidebar">
      <a href="/dashboard.html" class="sidebar-link" style="margin-bottom:4px; color:var(--ink-muted);">${ICON_BACK}Voltar ao CRM</a>
      <div class="brand">
        <div class="brand-mark mono">P</div>
        <div>
          <div class="brand-name">PromoWhats</div>
          <div class="brand-sub">Shopee · 5 grupos</div>
        </div>
      </div>
      <nav class="sidebar-nav">${linksHtml}</nav>
      <div class="sidebar-foot">
        <div>${usuarioEmail || ''}</div>
        <div>Motor: <b>afiliados.ofertas</b> (Supabase)</div>
        <button class="logout-btn" id="logoutBtn">Sair</button>
      </div>
    </aside>
  `;

  container.querySelector('#logoutBtn').addEventListener('click', logout);
}
