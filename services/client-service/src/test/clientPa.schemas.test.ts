import { describe, expect, it } from "vitest";
import { updateClientPABodySchema } from "../schemas/clientVerticals.schemas.js";

describe("updateClientPABodySchema money fields", () => {
  it.each([
    "tax_billing",
    "management_billing",
    "system_value",
  ])("accepts BRL amounts and null for %s", (field) => {
    for (const value of ["R$ 1.234,56", "1234,56", "1234.56", "300", null]) {
      expect(updateClientPABodySchema.safeParse({ [field]: value }).success).toBe(true);
    }
  });

  it.each([
    "tax_billing",
    "management_billing",
    "system_value",
  ])("rejects free text for %s", (field) => {
    for (const value of ["QA_abc", "mil reais", "R$", ""]) {
      expect(updateClientPABodySchema.safeParse({ [field]: value }).success).toBe(false);
    }
  });
});
