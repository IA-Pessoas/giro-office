import { MAX_REPORTING_QUERY_LIMIT } from "@workspace/shared";
import { describe, expect, it } from "vitest";

import { internalReportingExtractBodySchema } from "../schemas/internalReporting.schemas.js";

describe("task reporting extraction limit", () => {
  it("accepts the overflow probe and rejects larger limits", () => {
    const body = {
      source: "integracao.tasks",
      fields: ["name"],
      limit: MAX_REPORTING_QUERY_LIMIT,
    };

    expect(internalReportingExtractBodySchema.safeParse(body).success).toBe(true);
    expect(
      internalReportingExtractBodySchema.safeParse({ ...body, limit: MAX_REPORTING_QUERY_LIMIT + 1 })
        .success,
    ).toBe(false);
  });
});
