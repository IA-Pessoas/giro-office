// O Prisma Client dos Workers (runtime "workerd") importa o compilador de queries como
// `*.wasm?module`, que o workerd entrega como WebAssembly.Module. Este plugin faz o mesmo no
// vitest, para os testes de smoke rodarem o client real contra o Postgres local.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const SUFFIX = ".wasm?module";

export function wasmModule() {
  return {
    name: "workerd-wasm-module",
    enforce: "pre" as const,
    resolveId(source: string, importer?: string) {
      if (!source.endsWith(SUFFIX) || !importer) return null;
      return `${resolve(dirname(importer), source.slice(0, -"?module".length))}?module`;
    },
    load(id: string) {
      if (!id.endsWith(SUFFIX)) return null;
      const file = id.slice(0, -"?module".length);
      readFileSync(file); // falha cedo se o client não foi gerado
      return `import { readFileSync } from "node:fs";
export default new WebAssembly.Module(readFileSync(${JSON.stringify(file)}));`;
    },
  };
}
