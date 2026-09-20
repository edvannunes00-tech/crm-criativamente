-- Contratos — Migration 35
-- Ajusta o "MODELO GERENCIADO" dos produtos de criação de site (landing page e site institucional):
--  * o registro do domínio fica em nome da CONTRATADA (o CONTRATANTE usa o domínio do seu negócio);
--  * cancelamento do plano de Manutenção e Suporte: o site sai do ar, salvo se o CONTRATANTE optar por adquiri-lo;
--  * a aquisição (e a transferência do registro do domínio) é definida em aditivo.
-- Só altera o texto-base dos produtos. Contratos já criados mantêm o snapshot que tinham (contrato_itens.termos_contratuais).
-- REVISÃO JURÍDICA RECOMENDADA (titularidade do registro, retirada do ar, CDC art. 49).

update crm.produtos_servicos p
set termos_contratuais =
  left(p.termos_contratuais, position('MODELO GERENCIADO:' in p.termos_contratuais) - 1) ||
  'MODELO GERENCIADO: o site é hospedado e mantido nas contas da CONTRATADA (Cloudflare Pages e GitHub) e utiliza o domínio do negócio do CONTRATANTE, cujo registro permanece em nome da CONTRATADA. O CONTRATANTE recebe licença de uso do site enquanto o plano de Manutenção e Suporte, contratado em separado, estiver ativo e regular. Em caso de cancelamento desse plano, o site será retirado do ar, salvo se o CONTRATANTE optar por adquiri-lo. Em caso de inadimplência desse plano, após aviso prévio por escrito e o prazo de carência previsto no contrato, o site poderá ser suspenso até a regularização, sem exclusão do conteúdo fornecido pelo CONTRATANTE, ao qual é assegurada cópia mediante solicitação. A aquisição da propriedade do site pelo CONTRATANTE, bem como a transferência do registro do domínio, poderá ser contratada mediante valor e condições definidos em aditivo.'
where p.empresa_id = (select id from crm.empresas where slug = 'criativamente')
  and p.nome in ('Criação de Landing Page — Gerenciado', 'Criação de Site Institucional Completo — Gerenciado')
  and position('MODELO GERENCIADO:' in p.termos_contratuais) > 0;
