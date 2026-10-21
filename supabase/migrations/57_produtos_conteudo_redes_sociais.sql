INSERT INTO crm.produtos_servicos (
  empresa_id, nome, descricao, categoria, preco_padrao,
  recorrencia_tipo, recorrencia_valor_mensal,
  escopo_objeto, escopo_modalidade_gravacao, escopo_edicao, escopo_exclusoes, escopo_observacoes,
  exige_contrato
) VALUES
(
  '0acd4aff-7b27-43f0-9b7d-ad3d60b4c2b3',
  'Conteúdo para Redes Sociais — A cada 3 dias',
  'Gravação e edição de vídeos curtos para redes sociais, cadência de 1 vídeo a cada 3 dias (~10 vídeos/mês).',
  'Conteúdo para Redes Sociais',
  590.00,
  'conteudo_redes_sociais', 590.00,
  'Captação em meia diária mensal (3-4h, celular) de conteúdo do dia a dia, mais edição dos vídeos entregues no mês.',
  'presencial', 'Cortes, legendas e ajustes básicos de cor/áudio, entregues prontos para publicação.',
  'Não inclui roteirização completa nem produção com equipamentos profissionais (câmera, iluminação de estúdio).',
  '~10 vídeos de até 1 minuto por mês.',
  true
),
(
  '0acd4aff-7b27-43f0-9b7d-ad3d60b4c2b3',
  'Conteúdo para Redes Sociais — A cada 2 dias',
  'Gravação e edição de vídeos curtos para redes sociais, cadência de 1 vídeo a cada 2 dias (~15 vídeos/mês).',
  'Conteúdo para Redes Sociais',
  890.00,
  'conteudo_redes_sociais', 890.00,
  'Captação em meia diária mensal (3-4h, celular) de conteúdo do dia a dia, mais 1 a 2 vídeos roteirizados, e edição de todos os vídeos entregues no mês.',
  'presencial', 'Cortes, legendas e ajustes básicos de cor/áudio, entregues prontos para publicação.',
  'Não inclui produção com equipamentos profissionais (câmera, iluminação de estúdio).',
  '~15 vídeos de até 1 minuto por mês.',
  true
),
(
  '0acd4aff-7b27-43f0-9b7d-ad3d60b4c2b3',
  'Conteúdo para Redes Sociais — Diário',
  'Gravação e edição de vídeos curtos para redes sociais, cadência diária (~30 vídeos/mês).',
  'Conteúdo para Redes Sociais',
  1590.00,
  'conteudo_redes_sociais', 1590.00,
  'Captação em diária mensal estendida (celular) de conteúdo do dia a dia, mais vídeos roteirizados, e edição de todos os vídeos entregues no mês.',
  'presencial', 'Cortes, legendas e ajustes básicos de cor/áudio, entregues prontos para publicação.',
  'Não inclui produção com equipamentos profissionais (câmera, iluminação de estúdio).',
  '~30 vídeos de até 1 minuto por mês.',
  true
);
