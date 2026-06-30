import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const appRoot = path.join(repoRoot, "app");
const appSrc = path.join(appRoot, "src");

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

async function collectFiles(directory, extensions) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...await collectFiles(fullPath, extensions));
      continue;
    }

    if (extensions.includes(path.extname(entry.name).toLowerCase())) {
      files.push(fullPath);
    }
  }

  return files;
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

await runTest("dynamic img usages are intentional", async () => {
  const allowedFiles = [
    "src/modules/users/components/UserProfile.tsx",
    "src/shared/components/newLayout/AppShell.tsx",
    "src/shared/components/newLayout/Configuracoes.tsx",
    "src/modules/organizations/ui/OrganizationLogoForm.tsx",
    "src/modules/organizations/ui/OrganizationInfoPanel.tsx",
    "src/modules/organizations/components/OrganizationProfile.tsx",
    "src/modules/chat/components/ConversationWindow.tsx",
    "src/modules/chat/components/GroupInfoSidebar.tsx",
    "src/modules/chat/components/ChatListPanel.tsx",
  ];

  const tsxFiles = await collectFiles(appSrc, [".tsx"]);
  const offenders = [];

  for (const file of tsxFiles) {
    const source = await readFile(file, "utf8");

    if (!source.includes("<img")) {
      continue;
    }

    const relativePath = path.relative(appRoot, file).replaceAll(path.sep, "/");

    if (!allowedFiles.includes(relativePath)) {
      offenders.push(relativePath);
      continue;
    }

    if (!source.includes('decoding="async"')) {
      offenders.push(`${relativePath} missing decoding="async"`);
    }
  }

  assert.deepEqual(offenders, []);
});

await runTest("next image remote patterns are not broad", async () => {
  const source = await readAppFile("next.config.mjs");

  assert.equal(source.includes('hostname: "**"'), false);
  assert.equal(source.includes('hostname: "*"'), false);
});

await runTest("public logo assets respect source budget", async () => {
  const trackedAssets = [
    "public/logos/lions/Castelo.webp",
    "public/logos/lions/Grey.png",
    "public/logos/lions/Integracao.webp",
    "public/logos/lions/Tecnologia.webp",
  ];
  const maxBytes = 180 * 1024;
  const oversized = [];

  for (const relativePath of trackedAssets) {
    const info = await stat(path.join(appRoot, relativePath));

    if (info.size > maxBytes) {
      oversized.push(`${relativePath} ${info.size}`);
    }
  }

  assert.deepEqual(oversized, []);
});
