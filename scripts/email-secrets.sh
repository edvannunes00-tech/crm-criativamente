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

# Chave "só de envio" responde 401 com restricted_api_key ao listar domínios: isso é NORMAL (a chave é válida).
# Chave inexistente/errada responde 401 com outro motivo (ex.: invalid_api_key).
RESP="$(curl -s -w '\n%{http_code}' -H "Authorization: Bearer ${KEY}" https://api.resend.com/domains || true)"
CODE="$(printf '%s' "${RESP}" | tail -n1)"
BODY="$(printf '%s' "${RESP}" | sed '$d')"
if printf '%s' "${BODY}" | grep -q 'restricted_api_key'; then
  echo "Chave de envio (restrita) reconhecida pelo Resend."
elif [ "${CODE}" = "200" ]; then
  echo "Chave completa reconhecida pelo Resend."
else
  echo "O Resend recusou esta chave (HTTP ${CODE}). Nada foi salvo. Colou UMA vez só, sem espaços?"
  exit 1
fi

$SB secrets set --project-ref "$REF" \
  "RESEND_API_KEY=${KEY}" \
  "RESEND_FROM_EMAIL=Criativamente <contato@criativamentedigital.com.br>" \
  "EMAIL_CONTATO=contato@criativamentedigital.com.br"
unset KEY

echo; echo "Segredos de e-mail existentes (só nomes):"
$SB secrets list --project-ref "$REF" | grep -iE "RESEND|EMAIL" || true
echo "Pronto. Avise o Claude que terminou."
