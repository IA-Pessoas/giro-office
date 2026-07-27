import { describe, expect, it } from "vitest";

import {
  deactivateTiPasswordBodySchema,
  listTiPasswordsQuerySchema,
  updateTiPasswordBodySchema,
} from "../schemas/tiPassword.schemas.js";

describe("TI password schemas", () => {
  it.each(["active", "inactive", "all"] as const)("accepts status=%s", (status) => {
    expect(listTiPasswordsQuerySchema.parse({ status })).toMatchObject({ status });
  });

  it("rejects an unknown status", () => {
    expect(listTiPasswordsQuerySchema.safeParse({ status: "deleted" }).success).toBe(false);
  });

  it("trims a valid deactivation reason", () => {
    expect(deactivateTiPasswordBodySchema.parse({ reason: "  Vendor retired  " })).toEqual({
      reason: "Vendor retired",
    });
  });

  it.each([
    {},
    { reason: "" },
    { reason: "   " },
    { reason: 42 },
    { reason: "x".repeat(501) },
    { reason: "Vendor retired", active: false },
  ])("rejects invalid deactivation body %#", (body) => {
    expect(deactivateTiPasswordBodySchema.safeParse(body).success).toBe(false);
  });

  it.each([
    "active",
    "deactivated_at",
    "deactivated_by_user_id",
    "deactivation_reason",
  ])("keeps server-owned field %s out of generic update", (field) => {
    expect(updateTiPasswordBodySchema.safeParse({ [field]: false }).success).toBe(false);
  });
});
