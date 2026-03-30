import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const srcDir = path.join(rootDir, "src");
const routesFile = path.join(rootDir, "migration", "critical-routes.json");
const reportDir = path.join(rootDir, "migration", "reports");
const reportFile = path.join(reportDir, "chakra-usage.json");

const importPattern = /from\s+['"]@chakra-ui\/react['"]|from\s+['"]@chakra-ui\/icons['"]/;
const sourceExt = new Set([".ts", ".tsx", ".js", ".jsx"]);

function walk(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(fullPath));
      continue;
    }
    if (sourceExt.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }
  return files;
}

function toPosixRelative(filePath) {
  return path.relative(rootDir, filePath).split(path.sep).join("/");
}

const sourceFiles = walk(srcDir);
const chakraFiles = sourceFiles
  .filter((filePath) => importPattern.test(fs.readFileSync(filePath, "utf8")))
  .map(toPosixRelative)
  .sort();

const routes = JSON.parse(fs.readFileSync(routesFile, "utf8")).routes ?? [];
const report = {
  generatedAt: new Date().toISOString(),
  summary: {
    scannedFiles: sourceFiles.length,
    chakraFiles: chakraFiles.length,
    criticalRoutes: routes.length
  },
  criticalRoutes: routes,
  chakraImportFiles: chakraFiles
};

fs.mkdirSync(reportDir, { recursive: true });
fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`);

console.log(`Chakra usage report saved to ${toPosixRelative(reportFile)}`);
console.log(`Scanned files: ${report.summary.scannedFiles}`);
console.log(`Files importing Chakra: ${report.summary.chakraFiles}`);
