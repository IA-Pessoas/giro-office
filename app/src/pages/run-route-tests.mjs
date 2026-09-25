import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";

// #1370: 404 em português e <title> em toda página.
const pagesDir = new URL("./", import.meta.url);
const read = (file) => readFileSync(new URL(file, pagesDir), "utf8");

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

runTest("página 404 própria, em português, com link para o dashboard", () => {
  assert.ok(existsSync(new URL("404.tsx", pagesDir)), "falta pages/404.tsx");
  const source = read("404.tsx");
  assert.match(source, /<title>[^<]*Página não encontrada/);
  assert.match(source, /href="\/dashboard"/);
  assert.doesNotMatch(source, /could not be found/i);
});

// Páginas legadas mantidas no repositório, mas inalcançáveis: o redirect do next.config vem antes.
const REDIRECTED_PAGES = new Set([
  "home/index.tsx",
  "me/index.tsx",
  "users/index.tsx",
  "clients/[id]/commercial.tsx",
]);

runTest("toda página que renderiza tela tem <title>", () => {
  const missing = readdirSync(pagesDir, { recursive: true })
    .filter((file) => file.endsWith(".tsx") && !/(^|\/)_/.test(file))
    .filter((file) => !REDIRECTED_PAGES.has(file))
    .filter((file) => {
      const source = read(file);
      // Página que só redireciona no servidor não renderiza nada.
      const redirectOnly =
        /export default function \w+\(\) \{\s*return null;\s*\}/.test(source) && /redirect:/.test(source);
      return !redirectOnly && !source.includes("<title");
    });
  assert.deepEqual(missing, []);
});
