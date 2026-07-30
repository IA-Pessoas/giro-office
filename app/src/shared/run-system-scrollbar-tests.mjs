import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { relative } from "node:path";

const globalStylesSource = readFileSync(new URL("../styles/global.css", import.meta.url), "utf8");
const scrollbarUtilityUrl = new URL("./ui/newLayout/scrollbar.ts", import.meta.url);
const scrollbarUtilitySource = existsSync(scrollbarUtilityUrl)
  ? readFileSync(scrollbarUtilityUrl, "utf8")
  : "";
const appShellSource = readFileSync(
  new URL("./components/newLayout/AppShell.tsx", import.meta.url),
  "utf8",
);
const tiWorkspaceUiSource = readFileSync(
  new URL("../modules/ti/components/tiWorkspaceUi.ts", import.meta.url),
  "utf8",
);
const taskWorkspaceUiSource = readFileSync(
  new URL("../modules/integracao/components/taskWorkspaceUi.ts", import.meta.url),
  "utf8",
);
const projectListTableSource = readFileSync(
  new URL("../modules/integracao/components/ProjectListTable.tsx", import.meta.url),
  "utf8",
);
const certificateWorkspaceUiSource = readFileSync(
  new URL("../modules/certificates/components/certificateWorkspaceUi.ts", import.meta.url),
  "utf8",
);
const legacyOperationalModuleSources = {
  Commercial: readFileSync(new URL("./components/newLayout/Commercial.tsx", import.meta.url), "utf8"),
  DepartamentoPessoal: readFileSync(
    new URL("./components/newLayout/DepartamentoPessoal.tsx", import.meta.url),
    "utf8",
  ),
  Fiscal: readFileSync(new URL("./components/newLayout/Fiscal.tsx", import.meta.url), "utf8"),
  Marketing: readFileSync(new URL("./components/newLayout/Marketing.tsx", import.meta.url), "utf8"),
  Tecnologia: readFileSync(new URL("./components/newLayout/Tecnologia.tsx", import.meta.url), "utf8"),
};
const srcRootUrl = new URL("../", import.meta.url);

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

runTest("shared system scrollbar utility uses the blue design token", () => {
  assert.match(scrollbarUtilitySource, /SYSTEM_SCROLLBAR_CLASSNAME = "u-scrollbar-system"/);
  assert.match(
    scrollbarUtilitySource,
    /SYSTEM_HORIZONTAL_SCROLL_AREA_CLASSNAME = `overflow-x-auto \$\{SYSTEM_SCROLLBAR_CLASSNAME\}`/,
  );
  assert.match(
    scrollbarUtilitySource,
    /SYSTEM_VERTICAL_SCROLL_AREA_CLASSNAME = `overflow-y-auto \$\{SYSTEM_SCROLLBAR_CLASSNAME\}`/,
  );
  assert.match(globalStylesSource, /\.u-scrollbar-system\s*\{/);
  assert.match(globalStylesSource, /scrollbar-color:\s*var\(--colors-blue-500\) transparent;/);
  assert.match(globalStylesSource, /width:\s*0\.375rem;/);
  assert.match(globalStylesSource, /height:\s*0\.375rem;/);
  assert.match(globalStylesSource, /background:\s*var\(--colors-blue-500\);/);
});

runTest("AppShell applies the system scrollbar to vertical shell scrollers", () => {
  assert.match(appShellSource, /SYSTEM_VERTICAL_SCROLL_AREA_CLASSNAME/);
  assert.match(
    appShellSource,
    /className=\{`p-3 space-y-6 h-\[calc\(100vh-4rem\)\] \$\{SYSTEM_VERTICAL_SCROLL_AREA_CLASSNAME\}`\}/,
  );
  assert.match(
    appShellSource,
    /className=\{`flex-1 p-4 lg:p-8 \$\{SYSTEM_VERTICAL_SCROLL_AREA_CLASSNAME\}`\}/,
  );
});

runTest("operational module table scrollers reuse the shared system scrollbar", () => {
  assert.match(tiWorkspaceUiSource, /SYSTEM_SCROLLBAR_CLASSNAME/);
  assert.match(taskWorkspaceUiSource, /SYSTEM_HORIZONTAL_SCROLL_AREA_CLASSNAME/);
  assert.match(certificateWorkspaceUiSource, /SYSTEM_HORIZONTAL_SCROLL_AREA_CLASSNAME/);
  assert.doesNotMatch(taskWorkspaceUiSource, /bg-slate-400\/80/);
  assert.doesNotMatch(certificateWorkspaceUiSource, /bg-slate-400\/80/);
  assert.match(projectListTableSource, /SYSTEM_HORIZONTAL_SCROLL_AREA_CLASSNAME/);
  assert.doesNotMatch(projectListTableSource, /className="overflow-x-auto"/);
});

runTest("legacy operational pages style their horizontal scroll containers", () => {
  for (const [moduleName, moduleSource] of Object.entries(legacyOperationalModuleSources)) {
    const horizontalScrollClassNames = moduleSource.match(/className="[^"]*overflow-x-auto[^"]*"/g) ?? [];

    assert.ok(horizontalScrollClassNames.length > 0, `${moduleName} has horizontal scroll containers`);
    for (const className of horizontalScrollClassNames) {
      assert.match(className, /u-scrollbar-system/, `${moduleName} styles ${className}`);
    }
  }
});

runTest("all horizontal scroll containers opt into the system scrollbar", () => {
  const offenders = [];

  for (const sourceFileUrl of getSourceFileUrls(srcRootUrl)) {
    const relativePath = relative(srcRootUrl.pathname, sourceFileUrl.pathname).replaceAll("\\", "/");

    if (relativePath === "shared/ui/newLayout/scrollbar.ts") {
      continue;
    }

    const source = readFileSync(sourceFileUrl, "utf8");
    source.split(/\r?\n/).forEach((line, index) => {
      if (!line.includes("overflow-x-auto")) {
        return;
      }
      if (
        line.includes("u-scrollbar-system") ||
        line.includes("SYSTEM_HORIZONTAL_SCROLL_AREA_CLASSNAME") ||
        line.includes("tiThinScrollbarClassName")
      ) {
        return;
      }

      offenders.push(`${relativePath}:${index + 1}`);
    });
  }

  assert.deepEqual(offenders, []);
});

function getSourceFileUrls(dirUrl) {
  const entries = readdirSync(dirUrl, { withFileTypes: true });
  const sourceFileUrls = [];

  for (const entry of entries) {
    const entryUrl = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, dirUrl);

    if (entry.isDirectory()) {
      sourceFileUrls.push(...getSourceFileUrls(entryUrl));
      continue;
    }

    if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
      sourceFileUrls.push(entryUrl);
    }
  }

  return sourceFileUrls;
}
