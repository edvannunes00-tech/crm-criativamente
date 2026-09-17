-- Contratos — Migration 17
-- Assinatura desenhada (mouse/touch) capturada na pagina publica.
-- E "evidencia de aceite" dentro do fluxo, nao assinatura eletronica
-- qualificada -- ver aviso no relatorio de implementacao.
--
-- Guardada como imagem no MESMO bucket privado ja existente
-- (documentos-internos), path proprio por contrato, nunca bucket publico.
-- Vinculada a crm.contrato_dados_cliente (o snapshot do contrato), nao
-- a uma tabela nova.

alter table crm.contrato_dados_cliente
  add column assinatura_storage_path text,
  add column assinatura_confirmada_em timestamptz;

alter table crm.contrato_dados_cliente
  add constraint contrato_dados_cliente_assinatura_coerente check (
    (assinatura_storage_path is null) = (assinatura_confirmada_em is null)
  );

create or replace function crm.trg_before_contrato_dados_cliente()
returns trigger
language plpgsql
security definer
set search_path to 'crm', 'public'
as $$
declare
  v_empresa_contrato uuid;
  v_contrato_do_link uuid;
  v_apenas_assinatura boolean;
begin
  select empresa_id into v_empresa_contrato from crm.contratos where id = new.contrato_id;
  if v_empresa_contrato is distinct from new.empresa_id then
    raise exception 'Dados de cliente pertencem a um contrato de outra empresa (integridade violada).';
  end if;

  select contrato_id into v_contrato_do_link from crm.contrato_links where id = new.link_id;
  if v_contrato_do_link is distinct from new.contrato_id then
    raise exception 'O link informado não pertence a este contrato.';
  end if;

  if tg_op = 'UPDATE' then
    new.atualizado_em := now();

    v_apenas_assinatura :=
      old.assinatura_storage_path is null
      and new.assinatura_storage_path is not null
      and new.nome_completo is not distinct from old.nome_completo
      and new.cpf_cnpj is not distinct from old.cpf_cnpj
      and new.telefone is not distinct from old.telefone
      and new.email is not distinct from old.email
      and new.endereco_cep is not distinct from old.endereco_cep
      and new.endereco_logradouro is not distinct from old.endereco_logradouro
      and new.endereco_numero is not distinct from old.endereco_numero
      and new.endereco_complemento is not distinct from old.endereco_complemento
      and new.endereco_bairro is not distinct from old.endereco_bairro
      and new.endereco_cidade is not distinct from old.endereco_cidade
      and new.endereco_estado is not distinct from old.endereco_estado
      and new.confirmado_em is not distinct from old.confirmado_em;

    if old.confirmado_em is not null and not v_apenas_assinatura
       and not crm.tem_permissao(auth.uid(), old.empresa_id, 'contratos', 'administrar') then
      raise exception 'Estes dados já foram confirmados pelo cliente e não podem mais ser alterados.';
    end if;

    if old.assinatura_storage_path is not null
       and new.assinatura_storage_path is distinct from old.assinatura_storage_path
       and not crm.tem_permissao(auth.uid(), old.empresa_id, 'contratos', 'administrar') then
      raise exception 'A assinatura já registrada não pode ser alterada.';
    end if;
  end if;

  return new;
end;
$$;
