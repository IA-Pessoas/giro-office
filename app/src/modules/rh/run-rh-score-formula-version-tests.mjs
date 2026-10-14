import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { getRhScoreFormulaVersionLabel } = await import("./utils/rhScoreUi.ts");
const historySource = readFileSync("src/modules/rh/components/score/RhScoreHistoryPanel.tsx", "utf8");
const detailSource = readFileSync("src/modules/rh/components/score/RhScoreDetailDialog.tsx", "utf8");

assert.equal(getRhScoreFormulaVersionLabel("OfficeV1"), "Fórmula original do Office");
assert.equal(getRhScoreFormulaVersionLabel("LegacyV1"), "Fórmula do legado");
assert.equal(getRhScoreFormulaVersionLabel("unknown"), "Versão não identificada");
assert.match(historySource, /getRhScoreFormulaVersionLabel\(score\.formula_version\)/);
assert.match(detailSource, /getRhScoreFormulaVersionLabel\(score\.formula_version\)/);
console.log("RH score formula version: 5 passed");
