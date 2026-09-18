import { describe, expect, it } from "vitest";

import {
  assertSameOrganizationDay,
  normalizeOrganizationDate,
  organizationDayBounds,
  organizationDateKey,
} from "../utils/rhDateUtils.js";

describe("rhDateUtils", () => {
  it("calcula a chave do dia no fuso da organizacao", () => {
    expect(organizationDateKey(new Date("2026-09-16T01:00:00.000Z"), "America/Sao_Paulo")).toBe(
      "2026-09-15",
    );
  });

  it("normaliza a data para o inicio real do dia local", () => {
    expect(
      normalizeOrganizationDate(new Date("2026-09-16T12:00:00.000Z"), "America/Sao_Paulo"),
    ).toEqual(new Date("2026-09-16T03:00:00.000Z"));
  });

  it("preserva uma data civil mesmo em fusos adiantados", () => {
    expect(normalizeOrganizationDate("2026-09-16", "Pacific/Kiritimati")).toEqual(
      new Date("2026-09-15T10:00:00.000Z"),
    );
  });

  it("retorna limites UTC que cobrem exatamente o dia local", () => {
    const bounds = organizationDayBounds(new Date("2026-09-16T12:00:00.000Z"), "America/New_York");

    expect(bounds.start).toEqual(new Date("2026-09-16T04:00:00.000Z"));
    expect(bounds.end).toEqual(new Date("2026-09-17T03:59:59.999Z"));
  });

  it("rejeita jornada que atravessa o dia local", () => {
    expect(() =>
      assertSameOrganizationDay(
        {
          clock_in: new Date("2026-09-16T22:00:00.000Z"),
          lunch_out: new Date("2026-09-17T01:00:00.000Z"),
          lunch_in: new Date("2026-09-17T02:00:00.000Z"),
          clock_out: new Date("2026-09-17T04:00:00.000Z"),
        },
        "America/Sao_Paulo",
      ),
    ).toThrow(/Jornadas noturnas/iu);
  });
});
