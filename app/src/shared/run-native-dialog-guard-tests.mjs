import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

// #1368: confirmação destrutiva é sempre o ConfirmationDialog; os diálogos nativos do navegador
// (confirm/alert/prompt) bloqueiam a página, saem em inglês e ignoram o layout.
const srcDir = new URL("../", import.meta.url);
// Chamada via window/globalThis/self (., ?. ou ["nome"]) ou chamada solta; ignora `obj.confirm(`
// e declarações `function confirm(`.
const nativeDialog =
  /(?:\b(?:window|globalThis|self)\s*(?:\?\.|\.|\[\s*["'`])\s*|(?<![\w.$]|function\s+))(?:confirm|alert|prompt)(?:["'`]\s*\])?\s*(?:\?\.)?\s*\(/;
// Método shorthand (`confirm() {`, `async confirm(x): Promise<void> {`) é declaração, não chamada.
const methodDeclaration = /^(?:async\s+)?(?:confirm|alert|prompt)\s*\([^)]*\)\s*(?::[^{]*)?\{/;
const isNativeDialogCall = (text) => nativeDialog.test(text) && !methodDeclaration.test(text);

for (const call of [
  "window.confirm(",
  "globalThis.confirm(",
  "self.alert(",
  "window?.confirm(",
  'window["confirm"](',
  "if (confirm(",
]) {
  assert.ok(isNativeDialogCall(call), `deveria detectar: ${call}`);
}
for (const safe of [
  "function confirm(",
  "confirm() {",
  "async confirm(id: string): Promise<void> {",
  "dialog.confirm(",
  "onConfirm(",
  "myself.alert(",
]) {
  assert.ok(!isNativeDialogCall(safe), `falso positivo: ${safe}`);
}

const offenders = readdirSync(srcDir, { recursive: true })
  .filter((file) => /\.(?:tsx?|jsx?)$/.test(file))
  .flatMap((file) =>
    readFileSync(new URL(file, srcDir), "utf8")
      .split("\n")
      .map((line, index) => ({ file, line: index + 1, text: line.trim() }))
      .filter(({ text }) => !text.startsWith("//") && !text.startsWith("*") && isNativeDialogCall(text)),
  )
  .map(({ file, line, text }) => `${file}:${line} ${text}`);

assert.deepEqual(offenders, [], "Use o ConfirmationDialog em vez de confirm/alert/prompt nativos.");
console.log("PASS nenhum confirm/alert/prompt nativo no app");
