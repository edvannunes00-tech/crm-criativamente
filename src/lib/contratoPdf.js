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
import { clausulasDoContrato, montarContextoJuridico } from './contratoTexto.js';

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

export function gerarPdfContrato({ contrato, itens, bonus, empresaNome, contratadaDocumento, contratadaEndereco, contratadaResponsavel, contratadaResponsavelCpf, contratadaResponsavelCargo, contratadaAssinaturaDataUrl, contratadaAssinadaEm, marcaDagua, logoDataUrl, clienteSnapshot, versao, assinatura }) {
  const codigoContrato = String(contrato.codigo || (contrato.id || '').slice(0, 8)).toUpperCase();
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

      // marca d'água de leitura (contrato ainda NÃO assinado): diagonal, bem visível
      if (marcaDagua && doc.GState) {
        try {
          doc.saveGraphicsState();
          doc.setGState(new doc.GState({ opacity: 0.16 }));
          doc.setTextColor(200, 40, 40);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(46);
          doc.text(marcaDagua.linha1, larguraPagina / 2, alturaPagina / 2 - 18, { align: 'center', angle: 35 });
          doc.setFontSize(24);
          doc.text(marcaDagua.linha2, larguraPagina / 2 + 10, alturaPagina / 2 + 34, { align: 'center', angle: 35 });
          doc.restoreGraphicsState();
          doc.setTextColor(0);
        } catch { /* sem marca d'água de leitura */ }
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
      doc.text(`Contrato nº ${codigoContrato}`, larguraPagina - margem, 46, { align: 'right' });
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
      doc.text(`Contrato nº ${codigoContrato}`, margem, alturaPagina - 45);
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
  doc.text(`Contrato nº ${codigoContrato} — versão ${versao} — gerado em ${formatarData(new Date().toISOString())}`, margem, y);
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
  clausulasDoContrato(ctx).forEach((c) => {
    titulo(c.titulo, 11);
    paragrafo(c.texto(ctx));
    novaLinha(6);
  });

  // ---- Assinaturas: lado a lado, sempre juntas na mesma página ----
  // Altura real do bloco (titulo + colunas), calculada com as quebras de linha dos nomes.
  const colLargMedida = (largura - 28) / 2;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  const linhasNome = Math.max(quebrarLinhas(doc, ctx.contratanteEmpresa, colLargMedida - 6).length, quebrarLinhas(doc, clienteIdentificacao, colLargMedida - 6).length);
  const temDataAssinatura = Boolean(contratadaAssinaturaDataUrl || assinatura?.dataUrl);
  const alturaBloco = 18 + 4 + 12 + 60 + (temDataAssinatura ? 12 : 0) + 12 + linhasNome * 12 + 14 + 6;
  if (y + 24 + alturaBloco > doc.internal.pageSize.getHeight() - rodapeReservado) {
    doc.addPage();
    y = topoConteudo;
  } else {
    novaLinha(24);
  }
  titulo('ASSINATURAS', 12);
  novaLinha(4);

  const colLarg = (largura - 28) / 2;
  const xEsq = margem;
  const xDir = margem + colLarg + 28;
  const yTopo = y;

  // Desenha uma coluna de assinatura e devolve o Y final. dataUrl/quandoIso opcionais.
  function colunaAssinatura(x, rotulo, dataUrl, quandoIso, nome, docTexto) {
    let yy = yTopo;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(0);
    doc.text(rotulo, x, yy);
    yy += 12;
    let assinou = false;
    if (dataUrl) {
      try { doc.addImage(dataUrl, 'PNG', x, yy, 170, 56); assinou = true; } catch { /* cai na linha em branco */ }
    }
    yy += 60;
    if (!assinou) {
      doc.setDrawColor(60);
      doc.setLineWidth(0.6);
      doc.line(x, yy - 4, x + colLarg - 10, yy - 4);
    }
    if (assinou && quandoIso) {
      doc.setFontSize(8);
      doc.setTextColor(90);
      doc.text(`Assinado eletronicamente em ${formatarData(quandoIso, true)}`, x, yy + 6);
      doc.setTextColor(0);
      yy += 12;
    }
    yy += 12;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    quebrarLinhas(doc, nome, colLarg - 6).forEach((linha) => { doc.text(linha, x, yy); yy += 12; });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(docTexto, x, yy + 1);
    return yy + 14;
  }

  const yFimEsq = colunaAssinatura(xEsq, 'CONTRATADA', contratadaAssinaturaDataUrl, contratadaAssinadaEm, ctx.contratanteEmpresa, `${rotuloDocumento(contratadaDocumento)}: ${contratadaDocumento || 'não informado'}`);
  const yFimDir = colunaAssinatura(xDir, 'CONTRATANTE', assinatura?.dataUrl, assinatura?.confirmadoEm, clienteIdentificacao, `${rotuloDocumento(clienteCpfCnpj)}: ${clienteCpfCnpj}`);
  y = Math.max(yFimEsq, yFimDir);

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
