// ============================================================
// Bloco "Manutenção recorrente" reutilizado na ficha do contrato e do cliente.
// Somente leitura + cancelamento (que passa pela Edge Function, nunca direto no banco).
// Mostra status do CONTRATO e status FINANCEIRO separados.
// ============================================================
import { supabase } from './supabaseClient.js';
import { formatarMoeda, formatarData, escapeHtml, whatsappLink } from './format.js';
import { cancelarRecorrencia, abrirLinkContrato } from './contratoLinks.js';

const FIN_LABEL = { aguardando_pagamento: 'Aguardando pagamento', ativo: 'Em dia', pendente: 'Pagamento pendente', inadimplente: 'Inadimplente', cancelado: 'Cancelado', encerrado: 'Encerrado' };
const FIN_BADGE = { aguardando_pagamento: 'dot-neutro', ativo: 'dot-sucesso', pendente: 'dot-info', inadimplente: 'dot-erro', cancelado: 'dot-neutro', encerrado: 'dot-neutro' };
const SUP_LABEL = { ativo: 'Suporte ativo', em_carencia: 'Em carência', suspenso: 'Suporte suspenso', encerrado: 'Encerrado', aguardando: 'Aguardando' };
const SUP_BADGE = { ativo: 'dot-sucesso', em_carencia: 'dot-info', suspenso: 'dot-erro', encerrado: 'dot-neutro', aguardando: 'dot-neutro' };
const COB_LABEL = { aprovada: 'Aprovada', recusada: 'Recusada', pendente: 'Pendente', estornada: 'Estornada', cancelada: 'Cancelada' };
const STATUS_CONTRATO = { rascunho: 'Rascunho', enviado: 'Enviado', aguardando_assinatura: 'Aguardando assinatura', assinado: 'Assinado', validado: 'Validado', cancelado: 'Cancelado' };
const SITE_LABEL = { nao_aplicavel: '—', no_ar: 'No ar', suspenso: 'Suspenso' };

// Define manualmente o site_status (liga/desliga a automação baseada em pagamento).
// Pedido explícito: ter sempre uma opção de voltar o site no ar manualmente
// enquanto investiga/ajusta o pagamento, sem depender da automação.
async function definirSiteStatusManual(assinaturaId, siteStatus, manual) {
  const { data, error } = await supabase.rpc('definir_site_status_manual', { p_assinatura_id: assinaturaId, p_site_status: siteStatus, p_manual: manual });
  if (error) throw error;
  return data;
}

// filtro: { contrato_id } ou { contato_id }
export async function renderBlocoRecorrencia(container, { filtro, podeCancelar, linkContrato = false, aoAlterar }) {
  if (!container) return;
  let q = supabase.from('vw_recorrencias').select('*').order('inicio_em', { ascending: false, nullsFirst: true });
  Object.entries(filtro).forEach(([k, v]) => { q = q.eq(k, v); });
  const { data: recs, error } = await q;
  if (error || !recs || recs.length === 0) { container.innerHTML = ''; return; }

  const ids = recs.map((r) => r.id);
  const { data: cobs } = await supabase.from('cobrancas_recorrentes').select('assinatura_id, status, valor, ocorrida_em, provider_payment_id')
    .in('assinatura_id', ids).order('ocorrida_em', { ascending: false }).limit(60);

  // Link ativo (ainda não assinado/não revogado) por contrato -- é o MESMO link
  // público que leva direto pra tela de pagamento se os dados já estiverem
  // confirmados (contrato-publico.html decide a etapa certa sozinho). Reaproveita
  // a mesma infra da aba "Link" do contrato, só que com um botão direto aqui.
  const contratoIds = [...new Set(recs.map((r) => r.contrato_id))];
  const { data: linksAtivos } = await supabase.from('contrato_links').select('id, contrato_id, status, created_at')
    .in('contrato_id', contratoIds).in('status', ['ativo', 'dados_confirmados', 'confirmado']).is('excluido_em', null).order('created_at', { ascending: false });

  container.innerHTML = recs.map((r) => {
    const cobrancas = (cobs || []).filter((c) => c.assinatura_id === r.id).slice(0, 5);
    const viva = !['cancelado', 'encerrado'].includes(r.status_financeiro);
    const linkAtivo = (linksAtivos || []).find((l) => l.contrato_id === r.contrato_id);
    return `
      <div class="card mb-4" data-rec="${r.id}">
        <div class="flex items-center justify-between mb-2">
          <span class="mono-label">${r.plano === 'gestao_trafego' ? 'Gestão de tráfego pago' : 'Manutenção do site'}${linkContrato ? ` — <a href="/ficha-contrato.html?id=${r.contrato_id}" style="color:var(--white); text-decoration:underline;">${escapeHtml(r.contrato_titulo || 'contrato')}</a>` : ''}</span>
          <span class="flex gap-2">
            ${podeCancelar && viva && linkAtivo ? `<button class="btn btn-secondary btn-sm" data-reenviar-link="${linkAtivo.id}" data-contato-rec="${r.contato_id}">Reenviar link de pagamento</button>` : ''}
            ${podeCancelar && viva ? `<button class="btn btn-secondary btn-sm" data-cancelar-rec="${r.id}" style="color:var(--status-erro);">Cancelar recorrência</button>` : ''}
          </span>
        </div>
        <div class="flex gap-4" style="flex-wrap:wrap; align-items:center;">
          <div><div class="mono-label">Plano</div><div>${r.periodicidade === 'anual' ? 'Anual' : 'Mensal'} — ${formatarMoeda(r.valor)}</div></div>
          <div><div class="mono-label">Contrato</div><div>${escapeHtml(STATUS_CONTRATO[r.contrato_status] || r.contrato_status || '—')}</div></div>
          <div><div class="mono-label">Cobrança</div><span class="badge ${FIN_BADGE[r.status_financeiro] || 'dot-neutro'}"><span class="dot"></span>${FIN_LABEL[r.status_financeiro] || r.status_financeiro}</span></div>
          <div><div class="mono-label">Suporte</div><span class="badge ${SUP_BADGE[r.situacao_suporte] || 'dot-neutro'}"><span class="dot"></span>${SUP_LABEL[r.situacao_suporte] || r.situacao_suporte}</span>${r.situacao_suporte === 'em_carencia' && r.carencia_ate ? ` <span class="text-muted" style="font-size:11.5px;">até ${formatarData(r.carencia_ate)}</span>` : ''}</div>
          <div><div class="mono-label">Início</div><div>${r.inicio_em ? formatarData(r.inicio_em) : '—'}</div></div>
          <div><div class="mono-label">Próxima cobrança</div><div>${r.proxima_cobranca_em ? formatarData(r.proxima_cobranca_em) : '—'}</div></div>
          <div><div class="mono-label">Última aprovada</div><div>${r.ultima_aprovada_em ? formatarData(r.ultima_aprovada_em) : '—'}</div></div>
          <div><div class="mono-label">Última recusada</div><div>${r.ultima_recusada_em ? formatarData(r.ultima_recusada_em) : '—'}</div></div>
          ${r.cancelado_em ? `<div><div class="mono-label">Cancelada em</div><div>${formatarData(r.cancelado_em, true)}</div></div>` : ''}
        </div>
        <div class="flex items-center gap-2 mt-4" style="flex-wrap:wrap;">
          <div class="mono-label">Site</div>
          <span class="badge ${r.site_status === 'suspenso' ? 'dot-erro' : r.site_status === 'no_ar' ? 'dot-sucesso' : 'dot-neutro'}"><span class="dot"></span>${SITE_LABEL[r.site_status] || r.site_status}</span>
          ${r.site_status_manual
            ? `<span class="text-muted" style="font-size:11.5px;">travado manualmente</span><button class="btn btn-secondary btn-sm" data-site-auto="${r.id}">Voltar ao automático</button>`
            : `<button class="btn btn-secondary btn-sm" data-site-manual="${r.id}" data-site-valor="no_ar">Marcar no ar</button>
               <button class="btn btn-secondary btn-sm" data-site-manual="${r.id}" data-site-valor="suspenso" style="color:var(--status-erro);">Suspender agora</button>`}
        </div>
        ${cobrancas.length ? `
          <div class="mono-label mt-4 mb-2">Últimas cobranças</div>
          ${cobrancas.map((c) => `<div class="resumo-linha" style="display:flex; justify-content:space-between; padding:4px 0; font-size:12.5px;"><span>${c.ocorrida_em ? formatarData(c.ocorrida_em, true) : '—'}</span><span>${COB_LABEL[c.status] || c.status}</span><span>${formatarMoeda(c.valor)}</span></div>`).join('')}` : ''}
      </div>`;
  }).join('');

  container.querySelectorAll('[data-cancelar-rec]').forEach((btn) => btn.addEventListener('click', async () => {
    const motivo = prompt('Motivo do cancelamento (opcional):');
    if (motivo === null) return;
    if (!confirm('Cancelar a recorrência? Novas cobranças serão interrompidas. O histórico é preservado e nada é estornado automaticamente.')) return;
    btn.disabled = true; btn.textContent = 'Cancelando...';
    try {
      const r = await cancelarRecorrencia(btn.dataset.cancelarRec, motivo || null);
      if (r && r.ok === false) {
        alert(r.motivo === 'pagamento_nao_configurado' ? 'O Mercado Pago ainda não está configurado neste ambiente.' : 'O Mercado Pago não confirmou o cancelamento. Nada foi alterado.');
        btn.disabled = false; btn.textContent = 'Cancelar recorrência';
        return;
      }
    } catch (err) {
      alert('Não foi possível cancelar: ' + err.message);
      btn.disabled = false; btn.textContent = 'Cancelar recorrência';
      return;
    }
    await renderBlocoRecorrencia(container, { filtro, podeCancelar, linkContrato, aoAlterar });
    if (aoAlterar) aoAlterar();
  }));

  container.querySelectorAll('[data-reenviar-link]').forEach((btn) => btn.addEventListener('click', async () => {
    const rotulo = btn.textContent; btn.disabled = true; btn.textContent = 'Copiando...';
    try {
      const r = await abrirLinkContrato(btn.dataset.reenviarLink);
      const url = `${window.location.origin}/contrato-publico.html#t=${r.token}`;
      await navigator.clipboard.writeText(url);
      btn.textContent = 'Link copiado!';
      const { data: contatoInfo } = await supabase.from('contatos').select('whatsapp').eq('id', btn.dataset.contatoRec).maybeSingle();
      if (contatoInfo && contatoInfo.whatsapp) {
        const wa = document.createElement('button');
        wa.className = 'btn btn-secondary btn-sm'; wa.textContent = 'Enviar pelo WhatsApp';
        wa.addEventListener('click', () => {
          window.open(`${whatsappLink(contatoInfo.whatsapp)}?text=${encodeURIComponent(`Olá! Segue o link para você acompanhar/pagar sua mensalidade:\n\n${url}`)}`, '_blank');
        });
        btn.insertAdjacentElement('afterend', wa);
      }
      setTimeout(() => { btn.disabled = false; btn.textContent = rotulo; }, 4000);
    } catch (err) {
      alert('Não foi possível reenviar o link: ' + err.message);
      btn.disabled = false; btn.textContent = rotulo;
    }
  }));

  container.querySelectorAll('[data-site-manual]').forEach((btn) => btn.addEventListener('click', async () => {
    const valor = btn.dataset.siteValor;
    if (valor === 'suspenso' && !confirm('Marcar o site como suspenso? Isso só é um rótulo no painel — você ainda precisa tirar o site do ar manualmente onde ele está hospedado. A automação por pagamento para de tocar neste status até você mesmo voltar ao automático.')) return;
    btn.disabled = true;
    try { await definirSiteStatusManual(btn.dataset.siteManual, valor, true); }
    catch (err) { alert('Não foi possível alterar: ' + err.message); btn.disabled = false; return; }
    await renderBlocoRecorrencia(container, { filtro, podeCancelar, linkContrato, aoAlterar });
    if (aoAlterar) aoAlterar();
  }));

  container.querySelectorAll('[data-site-auto]').forEach((btn) => btn.addEventListener('click', async () => {
    const rec = recs.find((x) => x.id === btn.dataset.siteAuto);
    const statusAuto = rec && rec.status_financeiro === 'ativo' ? 'no_ar' : 'suspenso';
    btn.disabled = true;
    try { await definirSiteStatusManual(btn.dataset.siteAuto, statusAuto, false); }
    catch (err) { alert('Não foi possível alterar: ' + err.message); btn.disabled = false; return; }
    await renderBlocoRecorrencia(container, { filtro, podeCancelar, linkContrato, aoAlterar });
    if (aoAlterar) aoAlterar();
  }));
}
