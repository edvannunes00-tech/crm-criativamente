-- RECONSTRUÇÃO (2026-10-12): recuperado via pg_get_viewdef do estado atual do banco.

create or replace view crm.vw_contatos_status as
 SELECT id,
    empresa_id,
    nome,
    foto_url,
    empresa_marca,
    cpf_cnpj,
    email,
    whatsapp,
    instagram,
    site,
    cidade,
    estado,
    segmento_id,
    profissao_atividade,
    expertise,
    ja_da_aulas,
    formato_aulas,
    possui_curso,
    possui_comunidade,
    qtd_alunos_aprox,
    produtos_atuais,
    experiencia,
    observacoes,
    origem_id,
    responsavel_id,
    status_relacionamento,
    ltv_total,
    ultima_compra_at,
    potencial_valor,
    ultimo_contato_at,
    proximo_followup_at,
    observacoes_comerciais,
    origem_pagina,
    utm_source,
    utm_medium,
    utm_campaign,
    utm_content,
    utm_term,
    created_at,
    updated_at,
        CASE
            WHEN status_relacionamento = 'Lead'::text THEN 'Lead'::text
            WHEN (( SELECT count(*) AS count
               FROM crm.oportunidades o
                 JOIN crm.pipeline_etapas pe ON pe.id = o.etapa_id
              WHERE o.contato_id = c.id AND pe.is_ganho)) >= 2 THEN 'Cliente Recorrente'::text
            WHEN ultima_compra_at IS NOT NULL AND ultima_compra_at >= (now() - ((COALESCE(( SELECT (configuracoes.valor #>> '{}'::text[])::integer AS int4
               FROM crm.configuracoes
              WHERE configuracoes.empresa_id = c.empresa_id AND configuracoes.chave = 'dias_para_cliente_inativo'::text), 90) || ' days'::text)::interval)) THEN 'Cliente Ativo'::text
            ELSE 'Cliente Inativo'::text
        END AS status_calculado,
    criado_por,
    atualizado_por
   FROM crm.contatos c;
