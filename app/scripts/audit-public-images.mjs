import { stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const maxLogoBytes = 180 * 1024;
const trackedAssets = [
  "public/logos/lions/Castelo.webp",
  "public/logos/lions/Grey.png",
  "public/logos/lions/Integracao.webp",
  "public/logos/lions/Tecnologia.webp",
];

const rows = [];
const oversized = [];

for (const relativePath of trackedAssets) {
  const info = await stat(path.join(appRoot, relativePath));
  rows.push({ path: relativePath, bytes: info.size });

  if (info.size > maxLogoBytes) {
    oversized.push({ path: relativePath, bytes: info.size });
  }
}

rows.sort((a, b) => b.bytes - a.bytes);

for (const row of rows) {
  console.log(`${String(row.bytes).padStart(8, " ")} ${row.path}`);
}

if (oversized.length > 0) {
  console.error("\nOversized tracked logo assets:");

  for (const row of oversized) {
    console.error(`${row.bytes} ${row.path}`);
  }

  process.exitCode = 1;
}
