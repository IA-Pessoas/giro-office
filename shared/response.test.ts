import assert from "node:assert/strict";
import test from "node:test";

import { createSuccessResponse } from "./response.js";

test("createSuccessResponse wraps data in the shared success envelope", () => {
  const response = createSuccessResponse({
    status: "ok",
    service: "gateway",
  });

  assert.deepEqual(response, {
    success: true,
    data: {
      status: "ok",
      service: "gateway",
    },
  });
});
