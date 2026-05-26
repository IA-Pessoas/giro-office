import assert from "node:assert/strict";

import {
  buildContabilControlParams,
  CONTABIL_ENDPOINTS,
  executeNullableContabilRequest,
  isNotFoundError,
  unwrapContabilEnvelope,
} from "./services/contabilService.contract.ts";
import {
  contabilControlQueryKey,
  contabilRelationshipQueryKey,
  contabilResponsibleQueryKey,
  CONTABIL_QUERY_KEY,
} from "./hooks/queryKeys.ts";
import { getContabilErrorMessage } from "./services/contabilError.ts";
import { resolveContabilPermissionAccess } from "./hooks/contabilPermissionAccess.ts";

async function runTest(name, fn) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

await (async () => {
  await runTest("contabil endpoints use the expected contract", () => {
    assert.equal(CONTABIL_ENDPOINTS.controls, "/contabil/controls");
    assert.equal(CONTABIL_ENDPOINTS.controlById("10"), "/contabil/controls/10");
    assert.equal(
      CONTABIL_ENDPOINTS.responsibleByClient("20"),
      "/contabil/responsibles/client/20",
    );
    assert.equal(
      CONTABIL_ENDPOINTS.relationshipByClient("30"),
      "/contabil/relationships/client/30",
    );
  });

  await runTest("buildContabilControlParams maps clientId and competence to API params", () => {
    assert.deepEqual(
      buildContabilControlParams({
        clientId: "client-1",
        competence: "2026-05",
      }),
      {
        client_id: "client-1",
        competence: "2026-05",
      },
    );
  });

  await runTest("unwrapContabilEnvelope extracts data directly from the backend response", () => {
    const payload = {
      id: "control-1",
      client_id: "client-1",
      competence: "2026-05",
      notes: null,
    };

    assert.deepEqual(unwrapContabilEnvelope({ data: payload }), payload);
    assert.deepEqual(unwrapContabilEnvelope(payload), payload);
  });

  await runTest("executeNullableContabilRequest returns null on 404 responses", async () => {
    const result = await executeNullableContabilRequest(() =>
      Promise.reject({
        isAxiosError: true,
        response: {
          status: 404,
        },
      }),
    );

    assert.equal(result, null);
  });

  await runTest("executeNullableContabilRequest rethrows non-404 errors", async () => {
    const failure = {
      isAxiosError: true,
      response: {
        status: 500,
      },
    };

    await assert.rejects(() => executeNullableContabilRequest(() => Promise.reject(failure)));
  });

  await runTest("isNotFoundError only recognizes axios 404 responses", () => {
    assert.equal(
      isNotFoundError({
        isAxiosError: true,
        response: {
          status: 404,
        },
      }),
      true,
    );
    assert.equal(
      isNotFoundError({
        isAxiosError: true,
        response: {
          status: 400,
        },
      }),
      false,
    );
    assert.equal(isNotFoundError(new Error("boom")), false);
  });

  await runTest("contabil query keys vary by client and competence", () => {
    assert.deepEqual(CONTABIL_QUERY_KEY, ["contabil"]);
    assert.deepEqual(contabilControlQueryKey("client-1", "2026-05"), [
      "contabil",
      "control",
      "client-1",
      "2026-05",
    ]);
    assert.deepEqual(contabilResponsibleQueryKey("client-1"), [
      "contabil",
      "responsible",
      "client-1",
    ]);
    assert.deepEqual(contabilRelationshipQueryKey("client-1"), [
      "contabil",
      "relationship",
      "client-1",
    ]);
  });

  await runTest("resolveContabilPermissionAccess blocks normal users without contabil permission", () => {
    assert.deepEqual(resolveContabilPermissionAccess(null, 1), {
      canViewContabil: false,
      canEditContabil: false,
      isReadOnlyContabil: false,
    });
  });

  await runTest("resolveContabilPermissionAccess enables read-only mode for contabil viewer", () => {
    assert.deepEqual(resolveContabilPermissionAccess(0, 1), {
      canViewContabil: true,
      canEditContabil: false,
      isReadOnlyContabil: true,
    });
  });

  await runTest("resolveContabilPermissionAccess enables edit mode for contabil users", () => {
    assert.deepEqual(resolveContabilPermissionAccess(1, 1), {
      canViewContabil: true,
      canEditContabil: true,
      isReadOnlyContabil: false,
    });
  });

  await runTest("resolveContabilPermissionAccess always unlocks global admins", () => {
    assert.deepEqual(resolveContabilPermissionAccess(null, 2), {
      canViewContabil: true,
      canEditContabil: true,
      isReadOnlyContabil: false,
    });
  });

  await runTest("getContabilErrorMessage prefers backend error strings and falls back otherwise", () => {
    assert.equal(
      getContabilErrorMessage({
        isAxiosError: true,
        response: {
          data: {
            error: "Mensagem do backend",
          },
        },
      }),
      "Mensagem do backend",
    );

    assert.equal(
      getContabilErrorMessage(new Error("boom")),
      "N\u00e3o foi poss\u00edvel concluir a opera\u00e7\u00e3o cont\u00e1bil agora. Tente novamente em instantes.",
    );
  });
})();
