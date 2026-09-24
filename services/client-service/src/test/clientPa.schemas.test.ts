import { describe, expect, it } from "vitest";
import { updateClientPABodySchema } from "../schemas/clientVerticals.schemas.js";

const MONEY_FIELDS = ["tax_billing", "management_billing", "system_value"];

describe("updateClientPABodySchema money fields", () => {
  it.each(MONEY_FIELDS)("accepts BRL amounts and null for %s", (field) => {
    for (const value of ["R$ 1.234,56", "1234,56", "1234.56", "300", null]) {
      expect(updateClientPABodySchema.safeParse({ [field]: value }).success).toBe(true);
    }
  });

  it.each(MONEY_FIELDS)("rejects free text for %s", (field) => {
    for (const value of ["QA_abc", "mil reais", "R$", "", "1.2.3", "1.", "1500.5.0"]) {
      expect(updateClientPABodySchema.safeParse({ [field]: value }).success).toBe(false);
    }
  });
});
