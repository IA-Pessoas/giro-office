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
const missingStub = `throw new Error('Missing optional dependency "react-dom/server.edge"')`;
const notFoundStub =
  `throw Object.assign(new Error('Missing optional dependency "react-dom/server.edge"'), ` +
  `{ code: "MODULE_NOT_FOUND" })`;

const source = await readFile(handlerPath, "utf8");

if (!source.includes(notFoundStub)) {
  if (!source.includes(missingStub)) {
    throw new Error(`Stub de react-dom/server.edge nao encontrado em ${handlerPath}`);
  }
  await writeFile(handlerPath, source.replace(missingStub, notFoundStub));
}

console.log("react-dom/server.edge ausente agora cai para server.browser (React 18)");
