import { describe, expect, it } from "vitest";
import { createPartnerBodySchema, updatePartnerBodySchema } from "../schemas/partners.schemas.js";

const PJ_ID = "10000000-0000-4000-8000-000000000001";
const PF_ID = "10000000-0000-4000-8000-000000000002";
const PARTNER_ID = "10000000-0000-4000-8000-000000000003";

const body = { pj_id: PJ_ID, pf_id: PF_ID, part: 50, entry: "2024-01-15" };

function firstMessage(result: { success: boolean; error?: { issues: { message: string }[] } }) {
  return result.error?.issues[0]?.message;
}

describe("partner body schema", () => {
  it.each([0, -5, 150])("rejects participation %s outside (0, 100]", (part) => {
    const result = createPartnerBodySchema.safeParse({ ...body, part });
    expect(result.success).toBe(false);
    expect(firstMessage(result)).toBe("Participação deve ser maior que 0% e no máximo 100%.");
  });

  it("rejects exit before entry on create and update", () => {
    const exit = { ...body, exit: "2020-01-15" };
    for (const result of [
      createPartnerBodySchema.safeParse(exit),
      updatePartnerBodySchema.safeParse({ ...exit, id: PARTNER_ID }),
    ]) {
      expect(result.success).toBe(false);
      expect(firstMessage(result)).toBe("Data de saída não pode ser anterior à entrada.");
    }
  });

  it("rejects incomplete dates with a field message", () => {
    const result = createPartnerBodySchema.safeParse({ ...body, entry: "2024-01" });
    expect(result.success).toBe(false);
    expect(firstMessage(result)).toBe("Informe a data de entrada completa (dd/mm/aaaa).");
  });

  it("rejects impossible calendar dates instead of rolling them over", () => {
    const result = createPartnerBodySchema.safeParse({ ...body, entry: "2024-02-31" });
    expect(result.success).toBe(false);
    expect(firstMessage(result)).toBe("Informe a data de entrada completa (dd/mm/aaaa).");
  });

  it("accepts 100% and exit on the entry day", () => {
    expect(
      createPartnerBodySchema.safeParse({ ...body, part: 100, exit: "2024-01-15" }).success,
    ).toBe(true);
  });
});
