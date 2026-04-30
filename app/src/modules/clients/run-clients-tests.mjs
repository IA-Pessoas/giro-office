import assert from "node:assert/strict";

import {
  buildClientListParams,
  CLIENT_ENDPOINTS,
  unwrapClientEnvelope,
  unwrapClientPaDetail,
} from "./services/clientService.contract.ts";
import {
  mapClientStatusFromApi,
  mapClientStatusToApi,
} from "./utils/statusMapper.ts";

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

runTest("mapClientStatusFromApi converts Prospecção to Prospect", () => {
  assert.equal(mapClientStatusFromApi("Prospecção"), "Prospect");
});

runTest("mapClientStatusToApi converts Prospect to Prospecção", () => {
  assert.equal(mapClientStatusToApi("Prospect"), "Prospecção");
});

runTest("status mapper keeps unrelated values unchanged", () => {
  assert.equal(mapClientStatusFromApi("Ativo"), "Ativo");
  assert.equal(mapClientStatusToApi("Inativo"), "Inativo");
});

runTest("client endpoints use only /client contract", () => {
  assert.equal(CLIENT_ENDPOINTS.list, "/client/list");
  assert.equal(CLIENT_ENDPOINTS.create, "/client");
  assert.equal(CLIENT_ENDPOINTS.detail("123"), "/client/123");
  assert.equal(CLIENT_ENDPOINTS.activate("123"), "/client/123/activate");
  assert.equal(CLIENT_ENDPOINTS.detailPa("123"), "/client/123/pa");
  assert.equal(CLIENT_ENDPOINTS.createPa("123"), "/client/123/pa");
  assert.equal(CLIENT_ENDPOINTS.updatePa("123"), "/client/123/pa");
});

runTest("buildClientListParams forwards search, status, page and limit", () => {
  const filters = {
    search: "acme",
    status: "Prospect",
    page: 2,
    limit: 15,
  };

  assert.deepEqual(buildClientListParams(filters), filters);
});

runTest("unwrapClientEnvelope normalizes response.data.data", () => {
  const payload = { items: [], total: 0, page: 1, pageSize: 20, hasMore: false };

  assert.deepEqual(unwrapClientEnvelope({ success: true, data: payload }), payload);
  assert.deepEqual(unwrapClientEnvelope(payload), payload);
});

runTest("unwrapClientPaDetail returns nested detail payload", () => {
  const detail = {
    client_id: "123",
    activities: "Retail",
    client: {
      email: "client@example.com",
    },
  };

  assert.deepEqual(unwrapClientPaDetail({ success: true, data: { detail } }), detail);
  assert.deepEqual(unwrapClientPaDetail({ detail }), detail);
});
