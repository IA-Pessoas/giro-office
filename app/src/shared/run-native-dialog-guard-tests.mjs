import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

// #1368: confirmação destrutiva é sempre o ConfirmationDialog; os diálogos nativos do navegador
// (confirm/alert/prompt) bloqueiam a página, saem em inglês e ignoram o layout.
const srcDir = new URL("../", import.meta.url);
const nativeDialog = /(?:\bwindow\.|(?<![\w.]))(?:confirm|alert|prompt)\s*\(/;

const offenders = readdirSync(srcDir, { recursive: true })
  .filter((file) => /\.(?:tsx?|jsx?)$/.test(file))
  .flatMap((file) =>
    readFileSync(new URL(file, srcDir), "utf8")
      .split("\n")
      .map((line, index) => ({ file, line: index + 1, text: line.trim() }))
      .filter(({ text }) => !text.startsWith("//") && !text.startsWith("*") && nativeDialog.test(text)),
  )
  .map(({ file, line, text }) => `${file}:${line} ${text}`);

assert.deepEqual(offenders, [], "Use o ConfirmationDialog em vez de confirm/alert/prompt nativos.");
console.log("PASS nenhum confirm/alert/prompt nativo no app");
