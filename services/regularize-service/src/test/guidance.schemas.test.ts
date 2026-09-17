import { REGULARIZE_GUIDANCE_CHECKLIST_ITEMS } from "@workspace/shared";
import { describe, expect, it } from "vitest";
import { createGuidanceBodySchema, updateGuidanceBodySchema } from "../schemas/guidance.schemas.js";

const processId = "10000000-0000-4000-8000-000000000001";
const clientPjId = "10000000-0000-4000-8000-000000000002";
const clientPfId = "10000000-0000-4000-8000-000000000003";

const checklist = REGULARIZE_GUIDANCE_CHECKLIST_ITEMS.map(({ code }) => ({
  code,
  status: "Pendente" as const,
}));

function createBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    process_id: processId,
    target_type: "PJ",
    client_pj_id: clientPjId,
    status: "Em andamento",
    checklist,
    ...overrides,
  };
}

describe("guidance schemas", () => {
  it("exige checklist completo e status de item válido na criação", () => {
    expect(createGuidanceBodySchema.safeParse(createBody()).success).toBe(true);
    expect(
      createGuidanceBodySchema.safeParse(createBody({ checklist: checklist.slice(0, 16) })).success,
    ).toBe(false);
    expect(
      createGuidanceBodySchema.safeParse(createBody({ checklist: [...checklist, checklist[0]] }))
        .success,
    ).toBe(false);
    expect(
      createGuidanceBodySchema.safeParse(
        createBody({ checklist: [{ ...checklist[0], status: "Inválido" }, ...checklist.slice(1)] }),
      ).success,
    ).toBe(false);
  });

  it("valida os três tipos de alvo e o snapshot manual", () => {
    expect(createGuidanceBodySchema.safeParse(createBody()).success).toBe(true);
    expect(
      createGuidanceBodySchema.safeParse(
        createBody({ target_type: "PF", client_pj_id: undefined, client_pf_id: clientPfId }),
      ).success,
    ).toBe(true);
    expect(
      createGuidanceBodySchema.safeParse(
        createBody({
          target_type: "SEM_CLIENTE",
          client_pj_id: undefined,
          target_snapshot: { version: 1, source: "manual", name: "Interessado" },
        }),
      ).success,
    ).toBe(true);
    expect(
      createGuidanceBodySchema.safeParse(
        createBody({ target_type: "PJ", client_pf_id: clientPfId }),
      ).success,
    ).toBe(false);
    expect(
      createGuidanceBodySchema.safeParse(
        createBody({ target_type: "SEM_CLIENTE", client_pj_id: undefined }),
      ).success,
    ).toBe(false);
  });

  it("aceita processo omitido ou nulo na criação e em atualizações compatíveis", () => {
    expect(createGuidanceBodySchema.safeParse(createBody({ process_id: undefined })).success).toBe(
      true,
    );
    expect(createGuidanceBodySchema.safeParse(createBody({ process_id: null })).success).toBe(true);
    expect(
      updateGuidanceBodySchema.safeParse({
        id: processId,
        process_id: undefined,
        request: "Atualizar",
      }).success,
    ).toBe(true);
    expect(
      updateGuidanceBodySchema.safeParse({ id: processId, process_id: null, request: "Atualizar" })
        .success,
    ).toBe(true);
  });

  it("exige checklist completo quando ele aparece na atualização", () => {
    expect(updateGuidanceBodySchema.safeParse({ id: processId, checklist }).success).toBe(true);
    expect(
      updateGuidanceBodySchema.safeParse({ id: processId, checklist: checklist.slice(0, 16) })
        .success,
    ).toBe(false);
  });

  it("rejeita branch_data sem filial concluída e o exige quando concluída", () => {
    expect(
      createGuidanceBodySchema.safeParse(
        createBody({
          branch_data: { name: "Filial", address: "Rua A", city: "São Paulo", state: "SP" },
        }),
      ).success,
    ).toBe(false);
    const completedChecklist = checklist.map((item) =>
      item.code === "branch" ? { ...item, status: "Concluído" as const } : item,
    );
    expect(
      createGuidanceBodySchema.safeParse(createBody({ checklist: completedChecklist })).success,
    ).toBe(false);
    expect(
      createGuidanceBodySchema.safeParse(
        createBody({
          checklist: completedChecklist,
          branch_data: { name: "Filial", address: "Rua A", city: "São Paulo", state: "SP" },
        }),
      ).success,
    ).toBe(true);
  });
});
