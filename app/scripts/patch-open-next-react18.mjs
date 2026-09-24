import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// O Next 16 carrega react-dom/server.edge e so cai para server.browser (React 18) quando o
// erro tem code MODULE_NOT_FOUND. O stub do @opennextjs/cloudflare 1.20.6 para dependencia
// opcional ausente lanca Error sem code, e toda pagina SSR responde 500.
// ponytail: remendo no bundle gerado; remover quando o adapter der code ao stub ou o app for
// para React 19. Falha o build se o trecho mudar.
const appRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const handlerPath = path.join(appRoot, ".open-next/server-functions/default/app/handler.mjs");
const relativeHandlerPath = path.relative(appRoot, handlerPath);
const missingStub = `throw new Error('Missing optional dependency "react-dom/server.edge"')`;
const notFoundStub =
  `throw Object.assign(new Error('Missing optional dependency "react-dom/server.edge"'), ` +
  `{ code: "MODULE_NOT_FOUND" })`;

function fail(lines) {
  console.error(["", "Falha no ajuste pos-build do OpenNext (React 18).", ...lines, ""].join("\n"));
  process.exit(1);
}

let source;
try {
  source = await readFile(handlerPath, "utf8");
} catch {
  fail([
    `Nao encontrei ${relativeHandlerPath}.`,
    "Rode o build completo com `pnpm --filter @workspace/app cf:build`, que gera esse arquivo antes do ajuste.",
  ]);
}

if (!source.includes(notFoundStub)) {
  if (!source.includes(missingStub)) {
    fail([
      `O trecho esperado de react-dom/server.edge nao existe mais em ${relativeHandlerPath}.`,
      "Provavel causa: o @opennextjs/cloudflare ou o React mudou de versao.",
      "Dentro de app/, rode `pnpm exec opennextjs-cloudflare build && pnpm exec wrangler dev` e abra /login:",
      "- se a pagina renderizar, o ajuste nao e mais necessario; remova este script do cf:build;",
      '- se responder 500 com "Missing optional dependency", atualize o trecho neste script.',
    ]);
  }
  await writeFile(handlerPath, source.replace(missingStub, notFoundStub));
}

console.log("OpenNext ajustado: react-dom/server.edge ausente cai para server.browser (React 18).");
