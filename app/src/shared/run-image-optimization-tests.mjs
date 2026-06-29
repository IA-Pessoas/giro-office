import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const appRoot = path.join(repoRoot, "app");

async function runTest(name, fn) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

async function readAppFile(relativePath) {
  return readFile(path.join(appRoot, relativePath), "utf8");
}

await runTest("static loader uses next image", async () => {
  const source = await readAppFile("src/shared/components/Loader/index.tsx");

  assert.match(source, /import Image from "next\/image";/);
  assert.match(source, /<Image\s/s);
  assert.equal(source.includes("<img"), false);
  assert.match(source, /src="\/logos\/lions\/Castelo\.webp"/);
});

await runTest("module card uses next image with stable dimensions", async () => {
  const source = await readAppFile("src/shared/components/ModulosCards/index.tsx");

  assert.match(source, /import Image from "next\/image";/);
  assert.match(source, /interface ModuleCardProps/);
  assert.match(source, /width=\{150\}/);
  assert.match(source, /height=\{150\}/);
  assert.equal(source.includes("<img"), false);
});

await runTest("home module cards do not import heavy png assets", async () => {
  const source = await readAppFile("src/pages/home/index.tsx");

  assert.equal(source.includes("public/logos/lions/Tecnologia.png"), false);
  assert.equal(source.includes("public/logos/lions/Integracao.png"), false);
  assert.match(source, /\/logos\/lions\/Tecnologia\.webp/);
  assert.match(source, /\/logos\/lions\/Integracao\.webp/);
});
