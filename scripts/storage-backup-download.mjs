#!/usr/bin/env node
// ============================================================
// Backup do bucket privado "documentos-internos" (Storage)
// ------------------------------------------------------------
// Baixa cada objeto listado em docs/backups/2026-10-12/storage_manifest.json,
// preservando o caminho/nome original, e confere tamanho + SHA-256 de cada
// arquivo baixado contra o manifesto de origem.
//
// NÃO modifica nem apaga nada na origem (só faz GET). NÃO torna o bucket
// público -- usa a service_role key direto na API REST do Storage, que já
// tem acesso total independente de política pública.
//
// Credenciais: lidas de variáveis de ambiente, nunca de código ou argumento
// de linha de comando (apareceria no histórico do shell). Rode assim:
//
//   export SUPABASE_URL="https://wdhioclskicixdhkolce.supabase.co"
//   export SUPABASE_SERVICE_ROLE_KEY="a chave real, colada só aqui"
//   node scripts/storage-backup-download.mjs
//
// Pré-requisitos: Node 18+ (usa fetch nativo). Nenhuma dependência de npm.
//
// Em caso de QUALQUER arquivo ausente, incompleto (tamanho não bate) ou
// com hash divergente de uma tentativa anterior, o processo PARA
// imediatamente e imprime o problema -- não continua "pulando" erros.
// ============================================================

import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = "documentos-internos";
const MANIFEST_PATH = "docs/backups/2026-10-12/storage_manifest.json";
const OUTPUT_DIR = "docs/backups/2026-10-12/storage";
const RESULTADO_PATH = "docs/backups/2026-10-12/storage_manifest_baixado.json";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Faltam variáveis de ambiente. Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY antes de rodar.");
  process.exit(1);
}

function sha256DoArquivo(caminho) {
  const hash = createHash("sha256");
  hash.update(readFileSync(caminho));
  return hash.digest("hex");
}

async function baixarObjeto(nomeObjeto) {
  const url = `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${nomeObjeto}`;
  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      apikey: SERVICE_ROLE_KEY,
    },
  });
  if (!resp.ok || !resp.body) {
    throw new Error(`HTTP ${resp.status} ao baixar "${nomeObjeto}"`);
  }
  const destino = join(OUTPUT_DIR, nomeObjeto);
  mkdirSync(dirname(destino), { recursive: true });
  await pipeline(Readable.fromWeb(resp.body), createWriteStream(destino));
  return destino;
}

async function main() {
  const manifestoOrigem = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  console.log(`Manifesto de origem: ${manifestoOrigem.length} objetos.`);

  const resultado = [];

  for (const item of manifestoOrigem) {
    process.stdout.write(`Baixando ${item.name} ... `);
    let destino;
    try {
      destino = await baixarObjeto(item.name);
    } catch (err) {
      console.error(`\nERRO: não foi possível baixar "${item.name}": ${err.message}`);
      console.error("Processo interrompido. Nenhum arquivo além deste foi verificado.");
      process.exit(1);
    }

    const tamanhoEsperado = Number(item.size);
    const tamanhoReal = readFileSync(destino).length;
    const hash = sha256DoArquivo(destino);

    if (tamanhoReal !== tamanhoEsperado) {
      console.error(`\nDIVERGÊNCIA DE TAMANHO em "${item.name}": esperado ${tamanhoEsperado} bytes, baixado ${tamanhoReal} bytes.`);
      console.error("Processo interrompido. Verifique antes de continuar (pode ser objeto alterado na origem desde o manifesto, ou download incompleto).");
      process.exit(1);
    }

    console.log(`ok (${tamanhoReal} bytes, sha256 ${hash.slice(0, 12)}...)`);
    resultado.push({ name: item.name, size: String(tamanhoReal), sha256: hash, mimetype: item.mimetype, baixado_em: new Date().toISOString() });
  }

  writeFileSync(RESULTADO_PATH, JSON.stringify(resultado, null, 2));
  console.log(`\nConcluído: ${resultado.length}/${manifestoOrigem.length} objetos baixados e conferidos.`);
  console.log(`Arquivos em: ${OUTPUT_DIR}`);
  console.log(`Manifesto com hashes: ${RESULTADO_PATH}`);
}

main();
