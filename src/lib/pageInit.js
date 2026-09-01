import { requireSession, loadPermissoes } from './session.js';
import { renderSidebar, renderHeader } from '../components/sidebar.js';

export async function initPage({ paginaAtual, breadcrumb, title }) {
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

  return { session, perm };
}
