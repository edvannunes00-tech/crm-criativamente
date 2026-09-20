#!/usr/bin/env bash
# Guarda os segredos do Mercado Pago no Supabase (Edge Functions), sem instalar nada.
# Os valores são digitados aqui, no seu terminal, sem aparecer na tela e sem passar pelo chat.
set -euo pipefail
REF="wdhioclskicixdhkolce"
SB="npx --yes supabase@latest"

echo "== Mercado Pago -> Supabase (projeto $REF) =="

if ! $SB projects list >/dev/null 2>&1; then
  echo "Primeiro faça login no Supabase (abre o navegador):"
  $SB login
fi

if [ "${1:-}" = "--webhook" ]; then
  read -r -s -p "Chave secreta do webhook (não aparece ao digitar): " WH; echo
  WH="$(printf '%s' "${WH}" | tr -d '[:space:]')"
  if [ -z "${WH}" ]; then echo "Chave vazia. Nada foi salvo."; exit 1; fi
  echo "Tamanho da chave: ${#WH} caracteres."
  $SB secrets set --project-ref "$REF" "MERCADO_PAGO_WEBHOOK_SECRET=${WH}"
  unset WH
  echo; $SB secrets list --project-ref "$REF" | grep -i "MERCADO_PAGO" || true
  echo "Pronto. Avise o Claude que terminou."
  exit 0
fi

read -r -s -p "Access Token do Mercado Pago (use o de TESTE primeiro; não aparece ao digitar): " MP_TOKEN; echo
# tira espaços/quebras de linha que vêm junto ao colar
MP_TOKEN="$(printf '%s' "${MP_TOKEN}" | tr -d '[:space:]')"
if [ -z "${MP_TOKEN}" ]; then echo "Token vazio. Nada foi salvo."; exit 1; fi
echo "Tamanho do token: ${#MP_TOKEN} caracteres (normalmente entre 70 e 90)."
# confere o token direto no Mercado Pago ANTES de salvar (fica só no seu terminal)
CODE="$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer ${MP_TOKEN}" https://api.mercadopago.com/users/me || true)"
if [ "${CODE}" != "200" ]; then
  echo "O Mercado Pago recusou este token (HTTP ${CODE}). Nada foi salvo."
  echo "Confira: é o ACCESS TOKEN (não a Public Key) e foi colado UMA vez só."
  exit 1
fi
echo "Token aceito pelo Mercado Pago."
$SB secrets set --project-ref "$REF" "MERCADO_PAGO_ACCESS_TOKEN=${MP_TOKEN}"
unset MP_TOKEN

read -r -s -p "Chave secreta do webhook (Enter para pular e fazer depois): " WH; echo
if [ -n "${WH}" ]; then
  $SB secrets set --project-ref "$REF" "MERCADO_PAGO_WEBHOOK_SECRET=${WH}"
fi
unset WH

echo; echo "Segredos existentes (só nomes; os valores nunca são exibidos):"
$SB secrets list --project-ref "$REF" | grep -i "MERCADO_PAGO" || echo "(nenhum MERCADO_PAGO encontrado)"
echo "Pronto. Avise o Claude que terminou."
