import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { getRhErrorMessage } = await import("./utils/rhErrorMessage.ts");

const panelSource = readFileSync("src/modules/rh/components/RhPointAdjustmentPanel.tsx", "utf8");
const hookSource = readFileSync("src/modules/rh/hooks/useRhPoint.ts", "utf8");
const serviceSource = readFileSync("src/modules/rh/services/rhPointService.ts", "utf8");

function runTest(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

runTest("RH point adjustment errors preserve domain messages without leaking 5xx details", () => {
  const conflictMessage =
    "O dia está bloqueado por uma folha assinada; reabra a folha antes de altera-lo.";

  assert.equal(
    getRhErrorMessage({ response: { status: 409, data: { error: conflictMessage } } }, "fallback"),
    conflictMessage,
  );
  assert.equal(
    getRhErrorMessage(
      { response: { status: 422, data: { message: "Solicitação inválida." } } },
      "fallback",
    ),
    "Solicitação inválida.",
  );
  assert.equal(
    getRhErrorMessage(new Error("Request failed with status code 409"), "fallback"),
    "fallback",
  );
  assert.equal(
    getRhErrorMessage(
      { response: { status: 500, data: { error: "detalhe interno do banco" } } },
      "fallback",
    ),
    "fallback",
  );
  const internalServerError = Object.assign(new Error("senha do banco: segredo"), {
    response: { status: 500 },
  });
  assert.equal(getRhErrorMessage(internalServerError, "fallback"), "fallback");
});

runTest("RH individual e lote preservam a transição e a invalidação da lista", () => {
  assert.match(
    serviceSource,
    /put\(RH_ENDPOINTS\.approvePointAdjustment, payload\)/,
  );
  assert.match(
    serviceSource,
    /put\(RH_ENDPOINTS\.approvePointAdjustmentsBulk, payload\)/,
  );
  assert.match(
    panelSource,
    /await approveMutation\.mutateAsync\(\{ request_id: decision\.adjustment\.id \}\)/,
  );
  assert.match(panelSource, /toast\.success\("Solicitação aceita com sucesso\."\)/);
  assert.match(
    panelSource,
    /await bulkApproveMutation\.mutateAsync\(\{ request_ids: selectedRequestIds \}\)/,
  );
  assert.match(
    panelSource,
    /toast\.success\(`\$\{selectedRequestIds\.length\} ajustes aceitos com sucesso\.`\)/,
  );
  assert.match(
    hookSource,
    /useApproveRhPointAdjustmentMutation[\s\S]*invalidateQueries\(\{ queryKey: RH_POINT_QUERY_KEY \}\)/,
  );
  assert.match(
    hookSource,
    /useApproveRhPointAdjustmentsBulkMutation[\s\S]*invalidateQueries\(\{ queryKey: RH_POINT_QUERY_KEY \}\)/,
  );
  assert.match(
    panelSource,
    /resetDecision\(\);\s*toast\.error\(getRhErrorMessage\(error/,
  );
});
