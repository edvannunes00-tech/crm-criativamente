// ============================================================
// Sessão + Permissões — usado por toda página protegida.
//
// A permissão aqui é SÓ pra decidir o que a interface mostra.
// A proteção de verdade continua no RLS do banco (Fases 1-8A) —
// mesmo que uma tela apareça, qualquer leitura/escrita indevida
// é recusada pelo Postgres, não pela interface.
// ============================================================
import { supabase } from './supabaseClient.js';

const CACHE_KEY = 'crm_minhas_permissoes_v1';

export async function requireSession() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    window.location.href = '/login.html';
    return null;
  }
  return session;
}

export async function logout() {
  sessionStorage.removeItem(CACHE_KEY);
  await supabase.auth.signOut();
  window.location.href = '/login.html';
}

export async function loadPermissoes(forceRefresh = false) {
  if (!forceRefresh) {
    const cached = sessionStorage.getItem(CACHE_KEY);
    if (cached) return JSON.parse(cached);
  }
  const { data, error } = await supabase.rpc('minhas_permissoes');
  if (error) {
    console.error('Falha ao carregar permissões:', error);
    return null;
  }
  const registro = (data && data[0]) || null;
  sessionStorage.setItem(CACHE_KEY, JSON.stringify(registro));
  return registro;
}

export function podeVisualizar(perm, modulo) {
  return !!(perm && perm.permissoes && perm.permissoes[modulo] && perm.permissoes[modulo].visualizar);
}

export function podeVisualizarAlgum(perm, modulos) {
  return modulos.some((m) => podeVisualizar(perm, m));
}

export function podeFazer(perm, modulo, acao) {
  return !!(perm && perm.permissoes && perm.permissoes[modulo] && perm.permissoes[modulo][acao]);
}

export function temFlag(perm, flag) {
  return !!(perm && perm.flags_financeiras && perm.flags_financeiras[flag]);
}

// Detecta se um erro retornado pelo Supabase indica sessão expirada/
// inválida — usado por qualquer página que consulte dados, pra forçar
// logout e reautenticação em vez de mostrar um erro genérico confuso.
export function isAuthError(error) {
  if (!error) return false;
  const status = error.status || error.statusCode;
  const msg = (error.message || '').toLowerCase();
  return status === 401 || error.code === 'PGRST301' || msg.includes('jwt') || msg.includes('token');
}

export async function handleQueryError(error) {
  if (isAuthError(error)) {
    await logout();
    return true;
  }
  return false;
}
