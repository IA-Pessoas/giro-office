import { REGULARIZE_GUIDANCE_CHECKLIST_ITEMS, ServiceError } from "@workspace/shared";
import { describe, expect, it } from "vitest";
import {
  assertCompleteGuidanceChecklist,
  resolveBranchData,
} from "../services/guidanceChecklist.js";

const checklist = REGULARIZE_GUIDANCE_CHECKLIST_ITEMS.map(({ code }) => ({
  code,
  status: "Pendente" as const,
}));

describe("guidance checklist", () => {
  it("rejeita checklist com item ausente, extra, duplicado ou desconhecido", () => {
    for (const items of [
      checklist.slice(0, 16),
      [...checklist, checklist[0]],
      [...checklist.slice(0, 16), checklist[0]],
      [...checklist.slice(0, 16), { code: "desconhecido", status: "Pendente" as const }],
    ]) {
      expect(() => assertCompleteGuidanceChecklist(items)).toThrow(ServiceError);
    }
  });

  it("ordena o checklist validado pela ordem canônica", () => {
    expect(
      assertCompleteGuidanceChecklist([...checklist].reverse()).map((item) => item.code),
    ).toEqual(REGULARIZE_GUIDANCE_CHECKLIST_ITEMS.map(({ code }) => code));
  });

  it("descarta dados de filial quando o item não foi concluído", () => {
    expect(
      resolveBranchData(checklist, {
        name: "Filial",
        address: "Rua A",
        city: "São Paulo",
        state: "SP",
      }),
    ).toBeNull();
  });

  it("exige dados válidos para filial concluída", () => {
    const completedChecklist = checklist.map((item) =>
      item.code === "branch" ? { ...item, status: "Concluído" as const } : item,
    );

    expect(() => resolveBranchData(completedChecklist, null)).toThrow(ServiceError);
    expect(
      resolveBranchData(completedChecklist, {
        name: "Filial",
        address: "Rua A",
        city: "São Paulo",
        state: "SP",
      }),
    ).toEqual({ name: "Filial", address: "Rua A", city: "São Paulo", state: "SP" });
  });
});
