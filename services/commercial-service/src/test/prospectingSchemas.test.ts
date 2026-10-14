import { describe, expect, it } from "vitest";

import {
  createProspectingBodySchema,
  prospectingListQuerySchema,
  updateProspectingBodySchema,
} from "../schemas/prospecting.schemas.js";

const clientId = "b0000000-0000-4000-8000-000000000001";
const validFields = {
  client_id: clientId,
  status: "Análise Financeira",
  status_date: "2026-10-13T12:00:00.000Z",
  solution: "CASTELO",
  reference_month: "2026-10",
};

describe("prospecting schemas", () => {
  it("validates and normalizes the paginated prospecting filters", () => {
    expect(
      prospectingListQuerySchema.parse({
        page: "2",
        page_size: "25",
        status: "Fechado",
        search: "  Acme  ",
      }),
    ).toEqual({ page: 2, page_size: 25, status: "Fechado", search: "Acme" });
    expect(prospectingListQuerySchema.parse({})).toEqual({ page: 1, page_size: 20 });
    expect(prospectingListQuerySchema.safeParse({ page_size: "101" }).success).toBe(false);
    expect(prospectingListQuerySchema.safeParse({ status: "Todas" }).success).toBe(false);
  });

  it("requires the legacy solution, status date, and reference month on create", () => {
    expect(
      createProspectingBodySchema.safeParse({ client_id: clientId, status: validFields.status })
        .success,
    ).toBe(false);
    expect(createProspectingBodySchema.safeParse(validFields).success).toBe(true);
    expect(
      createProspectingBodySchema.safeParse({ ...validFields, status_date: null }).success,
    ).toBe(false);
  });

  it("accepts preserved commercial details and a pause reason", () => {
    expect(
      createProspectingBodySchema.safeParse({
        ...validFields,
        service: "Contabilidade",
        participants: "Ana e Bruno",
        meeting_mode: "Remota",
        branch: "Matriz",
        pause_reason: "Aguardando documentos",
      }).success,
    ).toBe(true);
  });

  it("requires a reason when the status is Paralisado", () => {
    expect(
      updateProspectingBodySchema.safeParse({
        status: "Paralisado",
        pause_reason: "  ",
      }).success,
    ).toBe(false);
    expect(
      updateProspectingBodySchema.safeParse({
        status: "Paralisado",
        pause_reason: "Aguardando decisão",
      }).success,
    ).toBe(true);
  });

  it("accepts or clears a calendar date for the scheduled reset", () => {
    expect(updateProspectingBodySchema.safeParse({ reset_date: "2026-10-15" }).success).toBe(true);
    expect(updateProspectingBodySchema.safeParse({ reset_date: null }).success).toBe(true);
    expect(updateProspectingBodySchema.safeParse({ reset_date: "2026-13-40" }).success).toBe(false);
  });

  it.each(["Baixada", "Inativo"] as const)("accepts the legacy status %s", (status) => {
    expect(updateProspectingBodySchema.safeParse({ status }).success).toBe(true);
    expect(prospectingListQuerySchema.safeParse({ status }).success).toBe(true);
  });
});
