import { describe, expect, it } from "vitest";
import {
  decideNitroHoursBodySchema,
  submitNitroHoursBodySchema,
} from "../schemas/nitroHours.schemas.js";

describe("nitro hours schemas", () => {
  it("accepts a positive integer and a valid quarter", () => {
    expect(submitNitroHoursBodySchema.parse({ quarter: "2026-Q3", hours: "10" })).toEqual({
      quarter: "2026-Q3",
      hours: 10,
    });
  });

  it("rejects invalid quarters and fractional hours", () => {
    expect(submitNitroHoursBodySchema.safeParse({ quarter: "2026-Q5", hours: 10 }).success).toBe(
      false,
    );
    expect(submitNitroHoursBodySchema.safeParse({ quarter: "2026-Q3", hours: 1.5 }).success).toBe(
      false,
    );
  });

  it("requires a reason to reject a certificate", () => {
    expect(decideNitroHoursBodySchema.safeParse({ status: "Rejected" }).success).toBe(false);
    expect(
      decideNitroHoursBodySchema.parse({
        status: "Rejected",
        rejection_reason: "Arquivo ilegível",
      }),
    ).toMatchObject({ status: "Rejected" });
  });
});
