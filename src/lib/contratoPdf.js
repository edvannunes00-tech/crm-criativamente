// ============================================================
// Geração do PDF do contrato (client-side, via jsPDF) + upload
// pro Storage privado existente (bucket documentos-internos) +
// registro em crm.documentos / crm.contratos_versoes.
//
// Roda no navegador, com a sessão autenticada do usuário do CRM —
// o upload respeita a RLS de storage.objects já existente
// (documentos_storage_insert: exige permissão 'documentos'/'criar'
// na empresa do próprio caminho do arquivo). Nenhuma Edge Function
// nova foi necessária pra isso.
// ============================================================
import { supabase } from './supabaseClient.js';
import { formatarMoeda, formatarData } from './format.js';
import { CLAUSULAS, montarContextoJuridico } from './contratoTexto.js';

function quebrarLinhas(doc, texto, larguraMax) {
  return doc.splitTextToSize(texto, larguraMax);
}

// clienteSnapshot: { nome_completo, cpf_cnpj, telefone, email, endereco_* } --
// SEMPRE que existir um snapshot confirmado em crm.contrato_dados_cliente,
// é ele que deve ser passado aqui, nunca o cadastro vivo de crm.contatos
// (que pode mudar depois e não pode reescrever um contrato já formalizado).
// assinatura: { dataUrl, confirmadoEm } opcional -- quando presente, o PDF
// já sai com a assinatura capturada em vez do espaço em branco.
// 11 dígitos = CPF, 14 = CNPJ; qualquer outra coisa mantém o rótulo genérico.
function rotuloDocumento(valor) {
  const digitos = String(valor || '').replace(/\D/g, '');
  if (digitos.length === 11) return 'CPF';
  if (digitos.length === 14) return 'CNPJ';
  return 'CPF/CNPJ';
}

// Carrega o logo do papel timbrado como data URL (null se falhar — o PDF
// sai normalmente, só sem logo/marca d'água).
export async function carregarLogoDataUrl() {
  try {
    const resp = await fetch('/logo.png');
    if (!resp.ok) return null;
    const blob = await resp.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export function gerarPdfContrato({ contrato, itens, bonus, empresaNome, contratadaDocumento, contratadaEndereco, contratadaResponsavel, contratadaResponsavelCpf, contratadaResponsavelCargo, contratadaAssinaturaDataUrl, logoDataUrl, clienteSnapshot, versao, assinatura }) {
  const clienteNomeCompleto = clienteSnapshot?.nome_completo || '—';
  const clienteCpfCnpj = clienteSnapshot?.cpf_cnpj || '—';
  const clienteEmpresaMarca = clienteSnapshot?.empresa_marca || null;
  const clienteIdentificacao = clienteEmpresaMarca ? `${clienteNomeCompleto} / ${clienteEmpresaMarca}` : clienteNomeCompleto;
  const enderecoPartes = clienteSnapshot
    ? [clienteSnapshot.endereco_logradouro, clienteSnapshot.endereco_numero, clienteSnapshot.endereco_complemento, clienteSnapshot.endereco_bairro, clienteSnapshot.endereco_cidade, clienteSnapshot.endereco_estado, clienteSnapshot.endereco_cep]
        .filter(Boolean)
    : [];
  const clienteEndereco = enderecoPartes.join(', ') || null;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const margem = 48;
  const largura = doc.internal.pageSize.getWidth() - margem * 2;
  // Papel timbrado: cabeçalho e rodapé reservados em todas as páginas
  // (desenhados no final, quando já se sabe o total de páginas).
  const topoConteudo = 104;
  const rodapeReservado = 74;
  let y = topoConteudo;

  function novaLinha(altura = 14) {
    y += altura;
    if (y > doc.internal.pageSize.getHeight() - rodapeReservado) {
      doc.addPage();
      y = topoConteudo;
    }
  }

  function titulo(texto, tamanho = 13) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(tamanho);
    doc.text(texto, margem, y);
    novaLinha(tamanho + 6);
  }

  function paragrafo(texto, tamanho = 10) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(tamanho);
    const linhas = quebrarLinhas(doc, texto, largura);
    linhas.forEach((linha) => {
      doc.text(linha, margem, y);
      novaLinha(tamanho + 4);
    });
  }


  const VERDE = [31, 138, 96];
  function aplicarPapelTimbrado() {
    const total = doc.getNumberOfPages();
    const larguraPagina = doc.internal.pageSize.getWidth();
    const alturaPagina = doc.internal.pageSize.getHeight();
    const linhasRodape = [
      [ctx.contratanteEmpresa, contratadaDocumento ? `${rotuloDocumento(contratadaDocumento)} ${contratadaDocumento}` : null].filter(Boolean).join('  ·  '),
      contratadaEndereco || null,
    ].filter(Boolean);

    for (let i = 1; i <= total; i++) {
      doc.setPage(i);

      // marca d'água discreta (só o cérebro, bem clara) centralizada
      if (logoDataUrl && doc.GState) {
        try {
          doc.saveGraphicsState();
          doc.setGState(new doc.GState({ opacity: 0.05 }));
          const lado = 300;
          doc.addImage(logoDataUrl, 'PNG', (larguraPagina - lado) / 2, (alturaPagina - lado) / 2, lado, lado * 0.96);
          doc.restoreGraphicsState();
        } catch { /* sem marca d'água */ }
      }

      // cabeçalho: logo + nome + filete verde
      if (logoDataUrl) {
        try { doc.addImage(logoDataUrl, 'PNG', margem, 32, 34, 33); } catch { /* sem logo */ }
      }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(15);
      doc.setTextColor(20);
      doc.text('CRIATIVAMENTE', margem + (logoDataUrl ? 44 : 0), 53);
      const larguraNome = doc.getTextWidth('CRIATIVAMENTE');
      doc.setTextColor(...VERDE);
      doc.text('.', margem + (logoDataUrl ? 44 : 0) + larguraNome, 53);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(110);
      doc.text(`Contrato nº ${contrato.id.slice(0, 8).toUpperCase()}`, larguraPagina - margem, 46, { align: 'right' });
      doc.text(`Versão ${versao}`, larguraPagina - margem, 58, { align: 'right' });
      doc.setDrawColor(...VERDE);
      doc.setLineWidth(1.4);
      doc.line(margem, 76, larguraPagina - margem, 76);

      // rodapé: filete cinza + dados da contratada + paginação
      doc.setDrawColor(200);
      doc.setLineWidth(0.5);
      doc.line(margem, alturaPagina - 58, larguraPagina - margem, alturaPagina - 58);
      doc.setFontSize(7.5);
      doc.setTextColor(120);
      linhasRodape.forEach((linha, idx) => doc.text(linha, margem, alturaPagina - 45 + idx * 10));
      doc.text(`Página ${i} de ${total}`, larguraPagina - margem, alturaPagina - 45, { align: 'right' });
      doc.setTextColor(0);
    }
  }

  // ---- Cabeçalho ----
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('CONTRATO DE PRESTAÇÃO DE SERVIÇOS', margem, y);
  novaLinha(20);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(90);
  doc.text(`Contrato nº ${contrato.id.slice(0, 8).toUpperCase()} — versão ${versao} — gerado em ${formatarData(new Date().toISOString())}`, margem, y);
  doc.setTextColor(0);
  novaLinha(24);

  // ---- Quadro comercial ----
  titulo('QUADRO COMERCIAL');
  paragrafo(`Cliente: ${clienteIdentificacao}    CPF/CNPJ: ${clienteCpfCnpj || '—'}`);
  if (clienteSnapshot?.telefone || clienteSnapshot?.email) {
    paragrafo(`Telefone: ${clienteSnapshot.telefone || '—'}    E-mail: ${clienteSnapshot.email || '—'}`);
  }
  if (clienteEndereco) paragrafo(`Endereço: ${clienteEndereco}`);
  paragrafo(`Título do contrato: ${contrato.titulo}`);
  novaLinha(4);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Item', margem, y);
  doc.text('Qtd', margem + 220, y);
  doc.text('Tabela', margem + 270, y);
  doc.text('Negociado', margem + 350, y);
  doc.text('Total', margem + 440, y);
  novaLinha(14);
  doc.setFont('helvetica', 'normal');
  (itens || []).forEach((item) => {
    doc.text(String(item.descricao || '—').slice(0, 40), margem, y);
    doc.text(String(item.quantidade), margem + 220, y);
    doc.text(formatarMoeda(item.valor_tabela_unitario), margem + 270, y);
    doc.text(formatarMoeda(item.valor_negociado_unitario), margem + 350, y);
    doc.text(formatarMoeda(item.valor_total), margem + 440, y);
    novaLinha(14);
  });

  novaLinha(6);
  paragrafo(`Valor de tabela: ${formatarMoeda(contrato.valor_tabela_total)}    Desconto: ${formatarMoeda(contrato.desconto_total)}    Valor negociado: ${formatarMoeda(contrato.valor_negociado_total)}`);
  if (contrato.condicoes_pagamento_texto) paragrafo(`Condições de pagamento: ${contrato.condicoes_pagamento_texto}`);

  if (bonus && bonus.length > 0) {
    novaLinha(4);
    doc.setFont('helvetica', 'bold');
    doc.text('Bônus:', margem, y);
    novaLinha(14);
    doc.setFont('helvetica', 'normal');
    bonus.forEach((b) => {
      paragrafo(`• ${b.descricao}${b.quantidade ? ` (x${b.quantidade})` : ''}`);
    });
  }

  if (contrato.condicoes_especiais) {
    novaLinha(4);
    doc.setFont('helvetica', 'bold');
    doc.text('Condições especiais:', margem, y);
    novaLinha(14);
    doc.setFont('helvetica', 'normal');
    paragrafo(contrato.condicoes_especiais);
  }

  novaLinha(16);

  // ---- Cláusulas ----
  const ctx = montarContextoJuridico({
    empresaNome, contratadaDocumento, contratadaEndereco, contratadaResponsavel, contratadaResponsavelCpf, contratadaResponsavelCargo,
    clienteNomeCompleto, clienteCpfCnpj, clienteEmpresaMarca, clienteEndereco, itens,
    suporteInicio: contrato.suporte_inicio,
  });
  CLAUSULAS.forEach((c) => {
    titulo(c.titulo, 11);
    paragrafo(c.texto(ctx));
    novaLinha(6);
  });

  novaLinha(24);
  titulo('ASSINATURAS', 12);
  novaLinha(4);

  // ---- Bloco CONTRATADA (empresa dona do contrato) ----
  // Nao ha captura de assinatura da contratada neste fluxo (so o cliente
  // assina, pela pagina publica) -- fica so a linha em branco pra
  // assinatura fisica/posterior, mas com identificacao completa.
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('CONTRATADA', margem, y);
  novaLinha(16);
  let assinouContratada = false;
  if (contratadaAssinaturaDataUrl) {
    try {
      doc.addImage(contratadaAssinaturaDataUrl, 'PNG', margem, y, 180, 60);
      novaLinha(64);
      assinouContratada = true;
    } catch { /* cai na linha em branco */ }
  }
  if (!assinouContratada) {
    doc.text('_________________________________________', margem, y);
    novaLinha(14);
  } else {
    doc.setFontSize(8);
    doc.setTextColor(90);
    doc.text(`Assinado eletronicamente em ${formatarData(new Date().toISOString(), true)}`, margem, y);
    doc.setTextColor(0);
    doc.setFontSize(10);
    novaLinha(14);
  }
  doc.setFont('helvetica', 'bold');
  doc.text(ctx.contratanteEmpresa, margem, y);
  novaLinha(13);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`${rotuloDocumento(contratadaDocumento)}: ${contratadaDocumento || 'não informado'}`, margem, y);
  doc.setFontSize(10);
  novaLinha(30);

  // ---- Bloco CONTRATANTE (cliente que preencheu/confirmou/assinou) ----
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('CONTRATANTE', margem, y);
  novaLinha(16);

  if (assinatura?.dataUrl) {
    // Assinatura capturada na pagina publica (mouse/touch) -- evidencia
    // de aceite dentro do fluxo, nao uma assinatura eletronica qualificada.
    // O aviso disso fica no relatorio de implementacao, nao aqui no PDF.
    try {
      doc.addImage(assinatura.dataUrl, 'PNG', margem, y, 180, 60);
      novaLinha(64);
    } catch {
      doc.text('_________________________________________', margem, y);
      novaLinha(14);
    }
    if (assinatura.confirmadoEm) {
      doc.setFontSize(8);
      doc.setTextColor(90);
      doc.text(`Assinado eletronicamente em ${formatarData(assinatura.confirmadoEm, true)}`, margem, y);
      doc.setTextColor(0);
      doc.setFontSize(10);
      novaLinha(14);
    }
  } else {
    doc.text('_________________________________________', margem, y);
    novaLinha(14);
  }
  doc.setFont('helvetica', 'bold');
  doc.text(clienteIdentificacao, margem, y);
  novaLinha(13);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`${rotuloDocumento(clienteCpfCnpj)}: ${clienteCpfCnpj}`, margem, y);
  doc.setFontSize(10);

  aplicarPapelTimbrado();
  return doc.output('blob');
}

// Faz upload do PDF e registra documento + nova versao do contrato.
// categoria: 'original' (gerado pelo sistema) ou 'assinado' (upload manual).
export async function salvarDocumentoContrato({ empresaId, contratoId, blob, categoria, nomeArquivo, usuarioId, motivoSubstituicao }) {
  const storagePath = `${empresaId}/contratos/${contratoId}/${Date.now()}-${nomeArquivo}`;

  const { error: uploadError } = await supabase.storage
    .from('documentos-internos')
    .upload(storagePath, blob, { contentType: 'application/pdf', upsert: false });
  if (uploadError) throw new Error(`Falha ao enviar o arquivo: ${uploadError.message}`);

  const { data: documento, error: docError } = await supabase
    .from('documentos')
    .insert({
      empresa_id: empresaId,
      entidade_tipo: 'contrato',
      entidade_id: contratoId,
      tipo_documento: 'contrato',
      categoria_documento: categoria,
      storage_path: storagePath,
      nome_arquivo: nomeArquivo,
      uploaded_by: usuarioId,
    })
    .select('id')
    .single();
  if (docError || !documento) throw new Error(`Falha ao registrar o documento: ${docError?.message || 'erro desconhecido'}`);

  const { data: ultimaVersao } = await supabase
    .from('contratos_versoes')
    .select('versao')
    .eq('contrato_id', contratoId)
    .order('versao', { ascending: false })
    .limit(1)
    .maybeSingle();
  const novaVersao = (ultimaVersao?.versao || 0) + 1;

  const { error: versaoError } = await supabase.from('contratos_versoes').insert({
    contrato_id: contratoId,
    empresa_id: empresaId,
    versao: novaVersao,
    documento_id: documento.id,
    motivo_substituicao: motivoSubstituicao || null,
    criado_por: usuarioId,
  });
  if (versaoError) throw new Error(`Falha ao registrar a versão do contrato: ${versaoError.message}`);

  return { documentoId: documento.id, versao: novaVersao, storagePath };
}
