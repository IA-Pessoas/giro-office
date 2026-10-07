import { MAX_REPORTING_QUERY_LIMIT } from "@workspace/shared";
import { describe, expect, it } from "vitest";

import { internalReportingExtractBodySchema } from "../schemas/internalReporting.schemas.js";

describe("client reporting extraction limit", () => {
  it("accepts the overflow probe and rejects larger limits", () => {
    const body = {
      source: "integracao.clients",
      fields: ["name"],
      limit: MAX_REPORTING_QUERY_LIMIT,
    };

    expect(internalReportingExtractBodySchema.safeParse(body).success).toBe(true);
    expect(
      internalReportingExtractBodySchema.safeParse({
        ...body,
        limit: MAX_REPORTING_QUERY_LIMIT + 1,
      }).success,
    ).toBe(false);
  });

  it("accepts the client groups source", () => {
    expect(
      internalReportingExtractBodySchema.safeParse({
        source: "integracao.client_groups",
        fields: ["group_name"],
        limit: 1,
      }).success,
    ).toBe(true);
  });
});
