#!/usr/bin/env bash
# Guarda a chave do Resend (envio de e-mail do CRM) no Supabase. O valor é digitado aqui, no seu
# terminal, sem aparecer na tela e sem passar pelo chat.
set -euo pipefail
REF="wdhioclskicixdhkolce"
SB="npx --yes supabase@latest"

echo "== Resend -> Supabase (projeto $REF) =="
if ! $SB projects list >/dev/null 2>&1; then
  echo "Primeiro faça login no Supabase (abre o navegador):"
  $SB login
fi

read -r -s -p "API Key do Resend (começa com re_; não aparece ao digitar): " KEY; echo
KEY="$(printf '%s' "${KEY}" | tr -d '[:space:]')"
if [ -z "${KEY}" ]; then echo "Chave vazia. Nada foi salvo."; exit 1; fi
echo "Tamanho da chave: ${#KEY} caracteres."
case "${KEY}" in re_*) ;; *) echo "A chave do Resend começa com re_. Confira se copiou a chave certa. Nada foi salvo."; exit 1;; esac

# 401 = chave inválida. 200/403 = chave válida (403 é normal em chave só de envio).
CODE="$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer ${KEY}" https://api.resend.com/domains || true)"
if [ "${CODE}" = "401" ] || [ "${CODE}" = "000" ]; then
  echo "O Resend recusou esta chave (HTTP ${CODE}). Nada foi salvo. Colou UMA vez só?"
  exit 1
fi
echo "Chave aceita pelo Resend."

$SB secrets set --project-ref "$REF" \
  "RESEND_API_KEY=${KEY}" \
  "RESEND_FROM_EMAIL=Criativamente <contato@criativamentedigital.com.br>" \
  "EMAIL_CONTATO=contato@criativamentedigital.com.br"
unset KEY

echo; echo "Segredos de e-mail existentes (só nomes):"
$SB secrets list --project-ref "$REF" | grep -iE "RESEND|EMAIL" || true
echo "Pronto. Avise o Claude que terminou."
