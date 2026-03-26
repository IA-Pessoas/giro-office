import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const srcDir = path.join(rootDir, "src");
const routesFile = path.join(rootDir, "migration", "critical-routes.json");
const reportDir = path.join(rootDir, "migration", "reports");
const reportFile = path.join(reportDir, "chakra-usage.json");

const chakraImportPattern =
  /from\s+['"]@chakra-ui\/react['"]|from\s+['"]@chakra-ui\/icons['"]/;
const clientPrimitivesPattern = /from\s+['"]@shared\/ui\/clientTabPrimitives['"]/;
const shimCommentPattern = /Chakra shims local/i;
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
const byContent = (re) =>
  sourceFiles
    .filter((filePath) => re.test(fs.readFileSync(filePath, "utf8")))
    .map(toPosixRelative)
    .sort();

const chakraFiles = byContent(chakraImportPattern);
const clientPrimitivesFiles = byContent(clientPrimitivesPattern);
const shimCommentFiles = byContent(shimCommentPattern);

const routes = JSON.parse(fs.readFileSync(routesFile, "utf8")).routes ?? [];
const report = {
  generatedAt: new Date().toISOString(),
  summary: {
    scannedFiles: sourceFiles.length,
    chakraImportFiles: chakraFiles.length,
    clientTabPrimitivesFiles: clientPrimitivesFiles.length,
    inlineShimCommentFiles: shimCommentFiles.length,
    criticalRoutes: routes.length,
  },
  criticalRoutes: routes,
  chakraImportFiles: chakraFiles,
  clientTabPrimitivesFiles: clientPrimitivesFiles,
  inlineShimCommentFiles: shimCommentFiles,
};

fs.mkdirSync(reportDir, { recursive: true });
fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`);

console.log(`Chakra / legacy UI report saved to ${toPosixRelative(reportFile)}`);
console.log(`Scanned files: ${report.summary.scannedFiles}`);
console.log(`Files importing @chakra-ui/*: ${report.summary.chakraImportFiles}`);
console.log(`Files importing clientTabPrimitives: ${report.summary.clientTabPrimitivesFiles}`);
console.log(`Files with inline Chakra shim comments: ${report.summary.inlineShimCommentFiles}`);
