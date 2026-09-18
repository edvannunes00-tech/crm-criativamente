import { requireSession, loadPermissoes } from './session.js';
import { renderSidebar, renderHeader } from '../components/sidebar.js';
import { ativarCamposDeData } from './format.js';

function garantirFavicon() {
  if (document.querySelector('link[rel="icon"]')) return;
  const link = document.createElement('link');
  link.rel = 'icon';
  link.type = 'image/svg+xml';
  link.href = '/favicon.svg';
  document.head.appendChild(link);
  const touchIcon = document.createElement('link');
  touchIcon.rel = 'apple-touch-icon';
  touchIcon.href = '/favicon.svg';
  document.head.appendChild(touchIcon);
}

export async function initPage({ paginaAtual, breadcrumb, title }) {
  garantirFavicon();
  const session = await requireSession();
  if (!session) throw new Error('sem sessão');

  const perm = await loadPermissoes();

  renderSidebar(document.getElementById('sidebarContainer'), {
    perm,
    usuarioNome: session.user.email,
    papelNome: perm ? perm.papel_nome : null,
    paginaAtual,
  });
  renderHeader(document.getElementById('headerContainer'), { breadcrumb, title });

  // ativa "clicar em qualquer lugar abre o calendário" em todo campo de
  // data já presente na página, e observa o resto do documento pra pegar
  // automaticamente campos que apareçam depois (ex: dentro de modais
  // preenchidos dinamicamente) — nenhuma tela precisa se preocupar com isso.
  ativarCamposDeData();
  new MutationObserver(() => ativarCamposDeData()).observe(document.body, { childList: true, subtree: true });

  return { session, perm };
}
