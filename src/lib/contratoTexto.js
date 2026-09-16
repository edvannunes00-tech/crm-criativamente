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
// jurídica validada por advogado. Revisão jurídica profissional é
// recomendada antes do uso comercial definitivo — ver aviso no
// relatório de implementação.
//
// A estrutura separa CONTRATO-BASE (cláusulas estáveis, abaixo)
// de QUADRO COMERCIAL (dados dinâmicos, montados em contratoPdf.js
// a partir do snapshot em crm.contratos/contrato_itens/contrato_bonus).
// ============================================================

export const CLAUSULAS = [
  {
    titulo: 'CLÁUSULA 1ª — DAS PARTES',
    texto: (ctx) => `De um lado, ${ctx.contratanteEmpresa}, doravante denominada CONTRATADA, e de outro lado, ${ctx.clienteNomeCompleto}, inscrito(a) no CPF/CNPJ sob o nº ${ctx.clienteCpfCnpj}, doravante denominado(a) CONTRATANTE, têm entre si justo e contratado o presente instrumento particular de prestação de serviços, que se regerá pelas cláusulas seguintes e pela legislação aplicável, em especial os artigos 421 e seguintes e 593 a 609 do Código Civil, e, quando aplicável, pelo Código de Defesa do Consumidor (Lei nº 8.078/1990).`,
  },
  {
    titulo: 'CLÁUSULA 2ª — DO OBJETO',
    texto: () => `O presente contrato tem por objeto a prestação, pela CONTRATADA, dos serviços de produção de conteúdo/curso descritos no Quadro Comercial que integra este instrumento, incluindo os produtos, quantidades, condições comerciais e eventuais bônus ali especificados, os quais fazem parte indissociável deste contrato.`,
  },
  {
    titulo: 'CLÁUSULA 3ª — DO QUADRO COMERCIAL',
    texto: () => `As condições comerciais específicas desta contratação — incluindo preço de tabela, valor efetivamente negociado, desconto concedido, forma e condições de pagamento, bônus e eventuais condições especiais — estão descritas no Quadro Comercial anexo, que reflete exatamente o que foi acordado entre as partes no momento da formalização deste contrato e que prevalece, para todos os efeitos, sobre o preço de tabela vigente no catálogo da CONTRATADA em qualquer outro momento.`,
  },
  {
    titulo: 'CLÁUSULA 4ª — DAS OBRIGAÇÕES DA CONTRATADA',
    texto: () => `A CONTRATADA obriga-se a prestar os serviços contratados com zelo, diligência e dentro dos padrões técnicos e de qualidade praticados no mercado, observando os prazos e condições estabelecidos no Quadro Comercial e mantendo o CONTRATANTE informado sobre o andamento dos trabalhos.`,
  },
  {
    titulo: 'CLÁUSULA 5ª — DAS OBRIGAÇÕES DO CONTRATANTE',
    texto: () => `O CONTRATANTE obriga-se a fornecer, em tempo hábil, as informações, materiais e insumos necessários à execução dos serviços, a efetuar os pagamentos nas condições e prazos acordados no Quadro Comercial, e a comunicar prontamente à CONTRATADA qualquer alteração relevante que possa impactar a prestação dos serviços.`,
  },
  {
    titulo: 'CLÁUSULA 6ª — DO PAGAMENTO E DO INADIMPLEMENTO',
    texto: () => `O pagamento observará estritamente a forma e as condições descritas no Quadro Comercial. Em caso de atraso no pagamento, incidirão, sobre o valor devido, multa moratória de 2% (dois por cento), juros de mora de 1% (um por cento) ao mês e correção monetária pelo índice oficial aplicável, sem prejuízo da possibilidade de suspensão da prestação dos serviços até a regularização e da adoção das medidas de cobrança cabíveis.`,
  },
  {
    titulo: 'CLÁUSULA 7ª — DA VIGÊNCIA, CANCELAMENTO E RESCISÃO',
    texto: () => `Este contrato vigora a partir da data de sua assinatura por ambas as partes, pelo prazo necessário à conclusão dos serviços descritos no Quadro Comercial. Qualquer das partes poderá rescindir este contrato mediante comunicação prévia por escrito à outra parte, respeitadas as obrigações já assumidas e os valores devidos até a data da rescisão, observado o direito de arrependimento previsto no art. 49 do Código de Defesa do Consumidor quando aplicável.`,
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
    titulo: 'CLÁUSULA 10ª — DA PROTEÇÃO DE DADOS PESSOAIS (LGPD)',
    texto: () => `Os dados pessoais do CONTRATANTE coletados para a formalização e execução deste contrato serão tratados pela CONTRATADA em conformidade com a Lei nº 13.709/2018 (Lei Geral de Proteção de Dados Pessoais), exclusivamente para as finalidades relacionadas à execução contratual, ao cumprimento de obrigações legais e regulatórias e à comunicação com o CONTRATANTE, sendo assegurados a este os direitos previstos nos artigos 17 a 22 da referida lei.`,
  },
  {
    titulo: 'CLÁUSULA 11ª — DA ASSINATURA E VALIDADE DO INSTRUMENTO',
    texto: () => `Este contrato poderá ser formalizado por assinatura física, eletrônica ou por outro meio idôneo de manifestação de vontade, sendo todas as modalidades reconhecidas pelas partes como válidas e suficientes para comprovar a anuência aos termos aqui dispostos, nos termos do art. 10, §2º da Medida Provisória nº 2.200-2/2001 e do art. 225 do Código Civil, que reconhecem a validade probatória de documentos eletrônicos.`,
  },
  {
    titulo: 'CLÁUSULA 12ª — DO FORO',
    texto: (ctx) => `Fica eleito o foro da comarca de ${ctx.foroComarca}, com renúncia expressa a qualquer outro, por mais privilegiado que seja, para dirimir quaisquer dúvidas ou controvérsias oriundas deste contrato, ressalvado o foro do domicílio do consumidor quando aplicável, nos termos do art. 101, I, do Código de Defesa do Consumidor.`,
  },
  {
    titulo: 'CLÁUSULA 13ª — DAS DISPOSIÇÕES GERAIS',
    texto: () => `Este instrumento representa a integralidade do acordo entre as partes quanto ao seu objeto, substituindo entendimentos ou negociações anteriores sobre a mesma matéria. Eventuais alterações às condições comerciais aqui pactuadas serão formalizadas por meio de nova versão deste contrato, devidamente identificada e registrada, sem prejuízo da validade das versões anteriores para fins de histórico e auditoria.`,
  },
];

export function montarContextoJuridico({ empresaNome, clienteNomeCompleto, clienteCpfCnpj }) {
  return {
    contratanteEmpresa: empresaNome || 'Criativamente',
    clienteNomeCompleto: clienteNomeCompleto || '—',
    clienteCpfCnpj: clienteCpfCnpj || '—',
    foroComarca: 'domicílio da CONTRATADA',
  };
}
