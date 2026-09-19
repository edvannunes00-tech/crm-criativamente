// ============================================================
// Texto jurídico do contrato — Criativamente
// ------------------------------------------------------------
// Modelo próprio de contrato de prestação de serviços de produção
// de conteúdo/curso, redigido com base em princípios gerais do
// Código Civil (arts. 421 e ss. — função social e boa-fé objetiva
// dos contratos; arts. 593 a 609 — prestação de serviço), do CDC
// (Lei 8.078/90, quando a contraparte for consumidor final), da
// LGPD (Lei 13.709/2018) e da validade de documentos/assinaturas
// eletrônicas reconhecida pela MP 2.200-2/2001 e pelo art. 10, §2º
// da própria MP e pelo art. 225 do Código Civil (reprodução
// eletrônica como prova).
//
// IMPORTANTE: este é um modelo-base profissional, não uma peça
// jurídica validada por advogado. REVISÃO JURÍDICA RECOMENDADA antes
// do uso comercial definitivo, com atenção especial às cláusulas 6ª-A
// (sinal/reserva/cancelamento) e 6ª-C (acessos/suspensão de suporte) —
// ver aviso detalhado no relatório de implementação.
//
// A estrutura separa CONTRATO-BASE (cláusulas estáveis, abaixo) de
// QUADRO COMERCIAL + ESCOPO (dados dinâmicos, montados a partir do
// SNAPSHOT em crm.contratos/contrato_itens/contrato_dados_cliente —
// nunca do catálogo vivo nem do cadastro vivo do contato).
// ============================================================

const ROTULO_ESCOPO_INCLUSAO = {
  incluido: 'Incluído',
  nao_incluido: 'Não incluído',
  adicional: 'Disponível apenas como contratação adicional (fora deste escopo)',
};

const ROTULO_MODALIDADE = {
  remoto: 'remota (gravação realizada pelo CONTRATANTE, com orientação da CONTRATADA)',
  presencial: 'presencial, em São Paulo e região, mediante agendamento prévio',
  hibrido: 'híbrida (parte remota, parte presencial, conforme planejamento contratado)',
};

// Monta o texto do escopo detalhado a partir do SNAPSHOT gravado em cada
// contrato_itens (nunca do catálogo vivo — um item já contratado preserva
// exatamente o escopo vigente no momento em que foi adicionado ao contrato).
const ROTULO_INICIO_SUPORTE = {
  entrega: 'após a entrega',
  assinatura: 'a partir da assinatura deste contrato',
};

export function montarTextoEscopo(itens, suporteInicio = 'entrega') {
  const itensComEscopo = (itens || []).filter((i) => i.escopo_objeto || i.termos_contratuais);
  if (itensComEscopo.length === 0) {
    return 'O escopo detalhado desta contratação está descrito no Quadro Comercial e nos itens que compõem este contrato.';
  }

  return itensComEscopo.map((item) => {
    const linhas = [];
    linhas.push(`${item.descricao || 'Item contratado'}:`);
    if (item.escopo_objeto) linhas.push(`Objeto: ${item.escopo_objeto}`);
    if (item.escopo_quantidade_maxima_aulas) {
      linhas.push(`Quantidade contratada: até ${item.escopo_quantidade_maxima_aulas} aulas. Este é o limite total contratado — aulas, regravações ou produções adicionais que ultrapassem esse limite não fazem parte da obrigação da CONTRATADA e poderão ser objeto de novo orçamento.`);
    }
    if (item.escopo_modalidade_gravacao) {
      linhas.push(`Modalidade de gravação: ${ROTULO_MODALIDADE[item.escopo_modalidade_gravacao] || item.escopo_modalidade_gravacao}.`);
    }
    if (item.escopo_equipamentos) linhas.push(`Equipamentos utilizados pela CONTRATADA: ${item.escopo_equipamentos}.`);
    if (item.escopo_direcao) linhas.push('Inclui direção de gravação pela CONTRATADA.');
    if (item.escopo_edicao) linhas.push(`Edição: ${item.escopo_edicao}`);
    if (item.escopo_capas) linhas.push(`Capas/miniaturas: ${item.escopo_capas}`);
    if (item.escopo_plataforma) linhas.push(`Plataforma: ${item.escopo_plataforma}`);
    if (item.escopo_pagina_vendas) linhas.push(`Página de vendas: ${item.escopo_pagina_vendas}`);
    const itensInclusao = [
      ['Certificado', item.escopo_certificado],
      ['Apostila/material complementar', item.escopo_apostila_material],
      ['Legendas', item.escopo_legendas],
      ['Vinheta', item.escopo_vinheta],
      ['Site profissional', item.escopo_site],
      ['Mídia física', item.escopo_midia_fisica],
    ].filter(([, valor]) => valor === 'incluido' || valor === 'adicional');
    if (itensInclusao.length > 0) {
      linhas.push(itensInclusao.map(([nome, valor]) => `${nome}: ${ROTULO_ESCOPO_INCLUSAO[valor] || valor}`).join(' | '));
    }
    if (item.escopo_prazo_suporte_meses) linhas.push(`Suporte: ${item.escopo_prazo_suporte_meses} meses ${ROTULO_INICIO_SUPORTE[suporteInicio] || ROTULO_INICIO_SUPORTE.entrega}, para orientação e auxílio operacional dentro deste escopo — não inclui novas gravações, regravações, novas aulas ou serviços não previstos no plano.`);
    if (item.escopo_observacoes) linhas.push(`Observações: ${item.escopo_observacoes}`);
    if (item.escopo_exclusoes) linhas.push(`Não incluído neste plano: ${item.escopo_exclusoes}`);
    if (item.termos_contratuais) linhas.push(item.termos_contratuais);
    return linhas.join(' ');
  }).join('\n\n');
}

export const CLAUSULAS = [
  {
    titulo: 'CLÁUSULA 1ª — DAS PARTES',
    texto: (ctx) => `De um lado, ${ctx.contratanteEmpresa}${ctx.contratadaDocumento ? `, inscrita no CNPJ/CPF sob o nº ${ctx.contratadaDocumento}` : ''}${ctx.contratadaEndereco ? `, com sede em ${ctx.contratadaEndereco}` : ''}${ctx.contratadaResponsavel ? `, neste ato representada por ${ctx.contratadaResponsavel}${ctx.contratadaResponsavelCpf ? `, CPF nº ${ctx.contratadaResponsavelCpf}` : ''}${ctx.contratadaResponsavelCargo ? ` (${ctx.contratadaResponsavelCargo})` : ''}` : ''}, doravante denominada CONTRATADA, e de outro lado, ${ctx.clienteIdentificacao}, inscrito(a) no CPF/CNPJ sob o nº ${ctx.clienteCpfCnpj}${ctx.clienteEndereco ? `, residente/sediado(a) em ${ctx.clienteEndereco}` : ''}, doravante denominado(a) CONTRATANTE, têm entre si justo e contratado o presente instrumento particular de prestação de serviços, que se regerá pelas cláusulas seguintes e pela legislação aplicável, em especial os artigos 421 e seguintes e 593 a 609 do Código Civil, e, quando aplicável, pelo Código de Defesa do Consumidor (Lei nº 8.078/1990).`,
  },
  {
    titulo: 'CLÁUSULA 1ª-A — DA CONTRATAÇÃO PARA USO PROFISSIONAL',
    texto: () => `O CONTRATANTE declara que contrata os serviços objeto deste instrumento para uso em sua atividade profissional ou empresarial, como insumo dessa atividade, e não como destinatário final para uso pessoal, doméstico ou familiar.`,
  },
  {
    titulo: 'CLÁUSULA 2ª — DO OBJETO',
    texto: () => `O presente contrato tem por objeto a prestação, pela CONTRATADA, dos serviços de produção de conteúdo/curso descritos no Quadro Comercial e no Escopo Detalhado que integram este instrumento, incluindo os produtos, quantidades, condições comerciais e eventuais bônus ali especificados, os quais fazem parte indissociável deste contrato.`,
  },
  {
    titulo: 'CLÁUSULA 2ª-A — DO ESCOPO DETALHADO',
    texto: (ctx) => `${ctx.escopoTexto} Este escopo reflete exatamente o plano contratado no momento da formalização deste contrato e permanece válido para este contrato independentemente de alterações futuras nos produtos e planos da CONTRATADA. Serviços, quantidades ou entregáveis não expressamente previstos neste escopo não integram a obrigação da CONTRATADA e podem ser objeto de novo orçamento/contratação.`,
  },
  {
    titulo: 'CLÁUSULA 3ª — DO QUADRO COMERCIAL',
    texto: () => `As condições comerciais específicas desta contratação — incluindo preço de tabela, valor efetivamente negociado, desconto concedido, forma e condições de pagamento, bônus e eventuais condições especiais — estão descritas no Quadro Comercial anexo, que reflete exatamente o que foi acordado entre as partes no momento da formalização deste contrato e que prevalece, para todos os efeitos, sobre o preço de tabela vigente no catálogo da CONTRATADA em qualquer outro momento.`,
  },
  {
    titulo: 'CLÁUSULA 4ª — DAS OBRIGAÇÕES DA CONTRATADA',
    texto: () => `A CONTRATADA obriga-se a prestar os serviços contratados com zelo, diligência e dentro dos padrões técnicos e de qualidade praticados no mercado, observando os prazos e condições estabelecidos no Quadro Comercial e no Escopo Detalhado, e mantendo o CONTRATANTE informado sobre o andamento dos trabalhos.`,
  },
  {
    titulo: 'CLÁUSULA 5ª — DAS OBRIGAÇÕES DO CONTRATANTE',
    texto: () => `O CONTRATANTE obriga-se a fornecer, em tempo hábil, as informações, materiais e insumos necessários à execução dos serviços, a efetuar os pagamentos nas condições e prazos acordados no Quadro Comercial, a cumprir os horários e datas previamente agendados quando houver produção presencial, e a comunicar prontamente à CONTRATADA qualquer alteração relevante que possa impactar a prestação dos serviços.`,
  },
  {
    titulo: 'CLÁUSULA 6ª — DO PAGAMENTO E DO INADIMPLEMENTO',
    texto: () => `O pagamento observará estritamente a forma e as condições descritas no Quadro Comercial. Em caso de atraso no pagamento, incidirão, sobre o valor devido, multa moratória de 2% (dois por cento), juros de mora de 1% (um por cento) ao mês e correção monetária pelo índice oficial aplicável, sem prejuízo da possibilidade de suspensão da prestação dos serviços até a regularização e da adoção das medidas de cobrança cabíveis.`,
  },
  {
    titulo: 'CLÁUSULA 6ª-A — DO SINAL (ARRAS), RESERVA DE AGENDA E CANCELAMENTO/ADIAMENTO',
    texto: () => `O valor pago a título de sinal/entrada é dado em arras confirmatórias, nos termos dos artigos 417 a 420 do Código Civil, como garantia de conclusão do contrato e como princípio de pagamento, e não representa apenas parte antecipada do preço: relaciona-se também à reserva de agenda, ao bloqueio de datas, ao planejamento da gravação, à organização de equipe, à preparação técnica e de equipamentos, à programação da edição/produção subsequente e à alocação da capacidade produtiva da CONTRATADA, atividades realizadas a partir da confirmação da contratação. O sinal/entrada vence no 8º (oitavo) dia corrido contado da assinatura deste contrato, e a reserva de agenda e o bloqueio de datas somente se confirmam após o pagamento do sinal. Sendo o contrato executado normalmente, o valor pago a título de sinal/entrada será integralmente abatido do valor total do serviço/produto contratado (art. 417 do Código Civil), restando ao CONTRATANTE apenas o saldo devedor. Se o CONTRATANTE, por sua iniciativa e sem alinhamento prévio com a CONTRATADA, cancelar, adiar ou deixar de executar o contrato, a CONTRATADA poderá dá-lo por desfeito e reter o valor do sinal/entrada, que não será devolvido em razão dos prejuízos decorrentes da reserva de agenda, do planejamento e da mobilização de recursos já realizados (art. 418 do Código Civil), sem prejuízo do direito de a CONTRATADA pleitear indenização suplementar caso comprove prejuízo maior, valendo o sinal como taxa mínima (art. 419 do Código Civil). Remarcações previamente acordadas entre as partes e hipóteses de caso fortuito ou força maior não configuram inexecução culposa do CONTRATANTE e serão tratadas conforme o que for ajustado entre as partes, sem retenção automática do sinal.`,
  },
  {
    titulo: 'CLÁUSULA 6ª-B — DO SUPORTE',
    texto: (ctx) => `O prazo de suporte previsto no Escopo Detalhado (${ctx.prazoSuporteMeses ? `${ctx.prazoSuporteMeses} meses ${ctx.suporteInicio === 'assinatura' ? 'a partir da assinatura deste contrato' : 'a partir da entrega'}` : 'conforme o plano contratado'}) destina-se à orientação, ao auxílio operacional e à manutenção dentro do escopo efetivamente contratado, não configurando produção ilimitada. O suporte não inclui, automaticamente, novas gravações, regravações, novas aulas, novo projeto, redesign completo, criação de novos produtos ou quaisquer alterações extraordinárias não previstas no plano contratado. Solicitações que extrapolem o escopo contratado poderão ser orçadas separadamente, mediante novo acordo entre as partes.`,
  },
  {
    titulo: 'CLÁUSULA 6ª-C — DOS ACESSOS A PLATAFORMAS E SISTEMAS',
    texto: () => `Quando a execução do serviço ou a prestação do suporte contratado depender de acesso a plataforma de cursos, hospedagem, site, domínio, ferramentas, sistemas, contas ou ambientes administrativos do CONTRATANTE, este deverá garantir à CONTRATADA os acessos estritamente necessários durante o período de execução e pelo prazo de suporte contratado, sendo que a CONTRATADA deverá utilizar somente os acessos necessários ao cumprimento de suas obrigações. Caso o CONTRATANTE remova os acessos concedidos, altere credenciais sem fornecer novo acesso, exclua a conta ou o ambiente, ou retire permissões necessárias, e isso impeça a prestação do suporte, o suporte poderá ser suspenso em relação às atividades que dependam do acesso removido, permanecendo o prazo de suporte contado normalmente, salvo acordo diferente entre as partes. A CONTRATADA poderá, por liberalidade e mediante concordância entre as partes, restabelecer o suporte posteriormente, sem que isso implique prorrogação automática do prazo contratado.`,
  },
  {
    titulo: 'CLÁUSULA 6ª-D — DA REGRAVAÇÃO DE AULAS',
    texto: () => `O suporte contratado não inclui a regravação de aulas já gravadas/produzidas no âmbito deste contrato. Situações que ensejam regravação como serviço adicional incluem, exemplificativamente: erro de conteúdo cometido pelo CONTRATANTE, mudança posterior de conteúdo, mudança de opinião ou de roteiro, atualização de aula já entregue, ou desejo de gravar novamente uma aula já aprovada. Quando a necessidade de regravação surgir depois da gravação/produção originalmente contratada e decorrer das hipóteses acima, a regravação será tratada como serviço adicional e poderá gerar novo orçamento. Esta cláusula não se aplica à correção de erro técnico de responsabilidade comprovada da CONTRATADA na execução do serviço originalmente contratado, hipótese em que a correção permanece obrigação da CONTRATADA dentro do escopo já pago.`,
  },
  {
    titulo: 'CLÁUSULA 6ª-E — DA ENTREGA, REVISÃO E APROVAÇÃO',
    texto: () => `Considera-se entrega a disponibilização do material editado ao CONTRATANTE para revisão, em link ou área privada, comunicada por WhatsApp ou e-mail. O vencimento da última parcela do preço independe de o CONTRATANTE ter concluído a revisão. Não havendo manifestação do CONTRATANTE no prazo de 7 (sete) dias corridos contados da entrega, o material será considerado aprovado. Ajustes solicitados dentro do prazo e do escopo seguem no âmbito do suporte contratado e não adiam o vencimento de qualquer parcela. A publicação final, a transferência de titularidade e de acessos e a entrega dos arquivos finais somente ocorrerão após a quitação integral do preço. A CONTRATADA não reterá o material bruto fornecido pelo CONTRATANTE.`,
  },
  {
    titulo: 'CLÁUSULA 7ª — DA VIGÊNCIA, CANCELAMENTO E RESCISÃO',
    texto: () => `Este contrato vigora a partir da data de sua assinatura por ambas as partes, pelo prazo necessário à conclusão dos serviços descritos no Quadro Comercial. Qualquer das partes poderá rescindir este contrato mediante comunicação prévia por escrito à outra parte, respeitadas as obrigações já assumidas e os valores devidos até a data da rescisão — incluindo, quando aplicável, a retenção de sinal prevista na Cláusula 6ª-A — observado o direito de arrependimento previsto no art. 49 do Código de Defesa do Consumidor quando aplicável.`,
  },
  {
    titulo: 'CLÁUSULA 8ª — DA PROPRIEDADE INTELECTUAL',
    texto: () => `Os direitos de propriedade intelectual sobre os materiais, métodos e tecnologias próprias empregados pela CONTRATADA na prestação dos serviços permanecem de titularidade da CONTRATADA, sendo concedida ao CONTRATANTE licença de uso do conteúdo final produzido, nos termos e limites definidos no Quadro Comercial ou em aditivo específico, sem prejuízo dos direitos autorais do CONTRATANTE sobre o conteúdo original por ele fornecido.`,
  },
  {
    titulo: 'CLÁUSULA 9ª — DA CONFIDENCIALIDADE',
    texto: () => `As partes comprometem-se a manter sigilo sobre quaisquer informações confidenciais trocadas em razão deste contrato, não as divulgando a terceiros sem autorização prévia e por escrito da outra parte, obrigação que subsiste mesmo após o encerramento deste contrato.`,
  },
  {
    titulo: 'CLÁUSULA 9ª-A — DA RETENÇÃO E EXCLUSÃO DE ARQUIVOS',
    texto: () => `Após a entrega dos materiais finais e sua validação pelo CONTRATANTE, os arquivos operacionais (incluindo arquivos editáveis/fonte, arquivos temporários e backups operacionais relacionados à produção) permanecerão disponíveis nos sistemas da CONTRATADA pelo prazo de 30 (trinta) dias, salvo disposição diferente expressamente estabelecida neste contrato. Após esse prazo, a CONTRATADA poderá excluir tais arquivos operacionais, cabendo ao CONTRATANTE realizar o download dos materiais finais e manter suas próprias cópias de segurança. Esta cláusula não se aplica aos documentos contratuais e aos registros que a CONTRATADA deva preservar por obrigação legal, regulatória ou para o exercício regular de direitos, os quais serão retidos pelos prazos aplicáveis nos termos da legislação vigente, inclusive da Lei Geral de Proteção de Dados (Lei nº 13.709/2018).`,
  },
  {
    titulo: 'CLÁUSULA 10ª — DA PROTEÇÃO DE DADOS PESSOAIS (LGPD)',
    texto: () => `Os dados pessoais do CONTRATANTE coletados para a formalização e execução deste contrato — incluindo nome, CPF/CNPJ, endereço, telefone e e-mail — serão tratados pela CONTRATADA em conformidade com a Lei nº 13.709/2018 (Lei Geral de Proteção de Dados Pessoais), exclusivamente para as finalidades relacionadas à execução contratual, ao cumprimento de obrigações legais e regulatórias e à comunicação com o CONTRATANTE, sendo assegurados a este os direitos previstos nos artigos 17 a 22 da referida lei.`,
  },
  {
    titulo: 'CLÁUSULA 11ª — DA ASSINATURA E VALIDADE DO INSTRUMENTO',
    texto: () => `Este contrato poderá ser formalizado por assinatura física, eletrônica ou por outro meio idôneo de manifestação de vontade, sendo todas as modalidades reconhecidas pelas partes como válidas e suficientes para comprovar a anuência aos termos aqui dispostos, nos termos do art. 10, §2º da Medida Provisória nº 2.200-2/2001 e do art. 225 do Código Civil, que reconhecem a validade probatória de documentos eletrônicos. A assinatura eletrônica simples eventualmente utilizada neste fluxo constitui evidência de aceite das partes, não se confundindo com assinatura digital certificada no padrão ICP-Brasil.`,
  },
  {
    titulo: 'CLÁUSULA 12ª — DO FORO',
    texto: (ctx) => `Fica eleito o foro da comarca de ${ctx.foroComarca}, com renúncia expressa a qualquer outro, por mais privilegiado que seja, para dirimir quaisquer dúvidas ou controvérsias oriundas deste contrato, ressalvado o foro do domicílio do consumidor quando aplicável, nos termos do art. 101, I, do Código de Defesa do Consumidor.`,
  },
  {
    titulo: 'CLÁUSULA 13ª — DAS DISPOSIÇÕES GERAIS',
    texto: () => `Este instrumento representa a integralidade do acordo entre as partes quanto ao seu objeto, substituindo entendimentos ou negociações anteriores sobre a mesma matéria. Eventuais alterações às condições comerciais ou ao escopo aqui pactuados serão formalizadas por meio de nova versão deste contrato, devidamente identificada e registrada, sem prejuízo da validade das versões anteriores para fins de histórico e auditoria.`,
  },
];

export function montarContextoJuridico({
  empresaNome,
  contratadaDocumento,
  contratadaEndereco,
  contratadaResponsavel,
  contratadaResponsavelCpf,
  contratadaResponsavelCargo,
  clienteNomeCompleto,
  clienteCpfCnpj,
  clienteEmpresaMarca,
  clienteEndereco,
  itens,
  suporteInicio,
}) {
  const clienteIdentificacao = clienteEmpresaMarca
    ? `${clienteNomeCompleto || '—'} / ${clienteEmpresaMarca}`
    : (clienteNomeCompleto || '—');

  const prazoSuporteMeses = (itens || [])
    .map((i) => i.escopo_prazo_suporte_meses)
    .filter((v) => v != null)
    .reduce((max, v) => Math.max(max, v), 0) || null;

  return {
    contratanteEmpresa: empresaNome || 'Criativamente',
    contratadaDocumento: contratadaDocumento || null,
    contratadaEndereco: contratadaEndereco || null,
    contratadaResponsavel: contratadaResponsavel || null,
    contratadaResponsavelCpf: contratadaResponsavelCpf || null,
    contratadaResponsavelCargo: contratadaResponsavelCargo || null,
    clienteIdentificacao,
    clienteNomeCompleto: clienteNomeCompleto || '—',
    clienteCpfCnpj: clienteCpfCnpj || '—',
    clienteEndereco: clienteEndereco || null,
    escopoTexto: montarTextoEscopo(itens, suporteInicio),
    suporteInicio: suporteInicio === 'assinatura' ? 'assinatura' : 'entrega',
    prazoSuporteMeses,
    foroComarca: 'domicílio da CONTRATADA',
  };
}
