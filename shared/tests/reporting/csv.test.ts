import assert from "node:assert/strict";
import test from "node:test";

import { csvCell, csvLine } from "../../src/reporting/csv.js";

test("csv neutraliza texto que a planilha executaria como fórmula", () => {
  for (const formula of ["=SUM(A1)", "+1", "-2", "@cmd", "  =HYPERLINK()", "\t=1", "\r=1"]) {
    assert.equal(csvCell(formula).replace(/^"|"$/g, "").startsWith("'"), true, formula);
  }
  // Números e texto comum passam intactos.
  assert.equal(csvCell(-2), "-2");
  assert.equal(csvCell("2,01"), '"2,01"');
  assert.equal(csvCell("2,01", ";"), "2,01");
  assert.equal(csvCell("Padaria Ltda"), "Padaria Ltda");
});

test("csv escapa o separador escolhido, aspas e quebras de linha", () => {
  assert.equal(csvLine(["a;b", 'c"d', "e\nf", null], ";"), '"a;b";"c""d";"e\nf";');
  assert.equal(csvLine(["a,b", "c"]), '"a,b",c');
});
