import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const configPath = path.join(rootDir, "migration", "visual-baseline.config.json");
const outputDir = path.join(rootDir, "migration", "reports");
const outputPath = path.join(outputDir, "visual-baseline.matrix.json");

if (!fs.existsSync(configPath)) {
  console.error("Visual baseline config not found.");
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const routes = config.routes ?? [];
const viewports = config.viewports ?? [];
const themes = config.themes ?? [];

const entries = [];

for (const route of routes) {
  for (const viewport of viewports) {
    for (const theme of themes) {
      const normalizedRoute = route.replace(/\//g, "-").replace(/^-/, "").replace(/\[|\]/g, "");
      entries.push({
        route,
        viewport: viewport.name,
        width: viewport.width,
        height: viewport.height,
        theme,
        filename: `${normalizedRoute || "root"}-${viewport.name}-${theme}.png`
      });
    }
  }
}

const matrix = {
  generatedAt: new Date().toISOString(),
  summary: {
    routes: routes.length,
    viewports: viewports.length,
    themes: themes.length,
    captureEntries: entries.length
  },
  entries
};

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(matrix, null, 2)}\n`);

console.log(`Visual baseline matrix saved to migration/reports/visual-baseline.matrix.json`);
console.log(`Total entries: ${entries.length}`);
