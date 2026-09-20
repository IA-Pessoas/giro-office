import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createContext, SourceTextModule, SyntheticModule } from "node:vm";

// Exercise the opt-in command at its browser/filesystem boundaries, without credentials,
// provider traffic, a database, or writing QA artifacts.
const runnerUrl = new URL("./wizard-evidence.mjs", import.meta.url);
const source = await readFile(runnerUrl, "utf8");

for (const [sensitive, captureFails] of [
  [false, false],
  [true, false],
  [false, true],
]) {
  test(`QA failure keeps credentials and Ata out of artifacts (sensitive=${sensitive}, captureFails=${captureFails})`, async () => {
    const confidential = "fixture-secret-and-meeting-minutes";
    const screenshots = [];
    const logs = [];
    const contexts = [];
    let closed = 0;
    const page = {
      goto: async () => {
        throw new Error(confidential);
      },
      getByLabel: (label) => label,
      screenshot: async (options) => {
        screenshots.push(options);
        if (captureFails) throw new Error(confidential);
      },
    };
    const browser = {
      newContext: async (options) => {
        contexts.push(options);
        return {
          newPage: async () => page,
          close: async () => {
            closed += 1;
          },
        };
      },
      close: async () => {
        closed += 1;
      },
    };
    const context = createContext({
      URL,
      process: { env: sensitive ? { WIZARD_QA_SENSITIVE_ATA: "/private/fixture.md" } : {} },
      console: { log: (...args) => logs.push(args.join(" ")) },
    });
    const dependencies = {
      "node:assert/strict": { default: assert },
      "node:fs/promises": {
        mkdir: async () => {},
        readFile: async () => confidential,
        readdir: async () => [],
        rename: async () => {},
        rm: async () => {},
      },
      "node:path": { default: path },
      "node:url": { fileURLToPath },
      "@playwright/test": { chromium: { launch: async () => browser }, expect: () => {} },
      "../../scripts/qa/integracao-fixtures.mjs": { INTEGRACAO_QA_PASSWORD: confidential },
    };
    const runner = new SourceTextModule(source, {
      context,
      initializeImportMeta: (meta) => {
        meta.url = runnerUrl.href;
      },
    });
    await runner.link((specifier) => {
      const exports = dependencies[specifier];
      assert.ok(exports, `Unexpected dependency: ${specifier}`);
      return new SyntheticModule(
        Object.keys(exports),
        function initialize() {
          for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
        },
        { context },
      );
    });
    await assert.rejects(runner.evaluate(), (error) => {
      assert.doesNotMatch(error.message, new RegExp(confidential));
      return true;
    });
    assert.equal(closed, 2, "The browser and context must close after failure.");
    assert.equal(contexts[0].recordVideo, undefined, "Video would record unmasked Ata.");
    assert.equal(screenshots.length, sensitive ? 0 : 1);
    if (!sensitive) {
      assert.ok(screenshots[0].mask.includes("Cole a Ata para extrair tarefas"));
      assert.ok(screenshots[0].mask.includes("Selecione um arquivo .txt, .md, .docx ou .pdf"));
    }
    assert.doesNotMatch(JSON.stringify({ logs, screenshots, contexts }), new RegExp(confidential));
  });
}
