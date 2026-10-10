import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeTriageDocumentStatus,
  TRIAGE_FISCAL_CHECKLIST_FIELDS,
  TRIAGE_FISCAL_SPECIAL_FIELDS,
} from "../../src/triagem/triageDocuments.ts";

test("mapeia os estados do legado e mantém os atuais (#1693)", () => {
  assert.equal(normalizeTriageDocumentStatus("COMPLETED"), "COMPLETED");
  assert.equal(normalizeTriageDocumentStatus(""), "PENDING");
  assert.equal(normalizeTriageDocumentStatus("nao possui"), "NOT_PRESENT");
  assert.equal(normalizeTriageDocumentStatus("atenção"), "ATTENTION");
  assert.equal(normalizeTriageDocumentStatus("atencao"), "ATTENTION");
  assert.equal(normalizeTriageDocumentStatus("concluido"), "COMPLETED");
  assert.equal(normalizeTriageDocumentStatus("toString"), null);
  assert.equal(normalizeTriageDocumentStatus(undefined), null);
});

test("documentos especiais são itens do checklist fiscal", () => {
  assert.equal(TRIAGE_FISCAL_SPECIAL_FIELDS.length, 7);
  for (const field of TRIAGE_FISCAL_SPECIAL_FIELDS)
    assert.ok((TRIAGE_FISCAL_CHECKLIST_FIELDS as readonly string[]).includes(field), field);
});
