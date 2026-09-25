import "./envBootstrap.js";

import { describe, expect, it } from "vitest";

import { CertificatePfService } from "../services/certificatePfService.js";
import { CertificatePjService } from "../services/certificatePjService.js";
import { certificateOrganizationId } from "./testUtils.js";

type Row = {
  organization_id: string;
  name: string;
  expiration_date: Date;
  has_certificate: boolean;
};
type Where = Record<string, unknown>;

// Avalia o subconjunto de `where` do Prisma usado pela listagem de certificados.
function matches(row: Row, where: Where): boolean {
  return Object.entries(where).every(([field, condition]) => {
    if (field === "AND") return (condition as Where[]).every((part) => matches(row, part));
    const value = row[field as keyof Row];
    if (condition && typeof condition === "object" && !(condition instanceof Date)) {
      const c = condition as { lt?: Date; gte?: Date; contains?: string };
      if (c.lt && !(value < c.lt)) return false;
      if (c.gte && !(value >= c.gte)) return false;
      if (c.contains && !String(value).toLowerCase().includes(c.contains.toLowerCase())) {
        return false;
      }
      return true;
    }
    return value === condition;
  });
}

function fakeDelegate(rows: Row[]) {
  return {
    count: async ({ where }: { where: Where }) => rows.filter((row) => matches(row, where)).length,
    findMany: async ({ where, skip, take }: { where: Where; skip: number; take: number }) =>
      rows.filter((row) => matches(row, where)).slice(skip, skip + take),
  };
}

const now = new Date("2026-09-25T15:00:00.000Z");
const day = (offset: number) => new Date(Date.UTC(2026, 8, 25 + offset));

// 45 certificados (3 páginas de 20): 25 vencidos, 12 vencendo em até 30 dias, 8 depois disso.
function buildRows(): Row[] {
  const rows: Row[] = [];
  for (let i = 0; i < 25; i++) {
    rows.push({
      organization_id: certificateOrganizationId,
      name: `vencido ${i}`,
      expiration_date: day(-1 - i),
      has_certificate: i % 5 === 0,
    });
  }
  for (let i = 0; i < 12; i++) {
    rows.push({
      organization_id: certificateOrganizationId,
      name: `pezinho ${i}`,
      expiration_date: day(i * 2 + (i === 11 ? 8 : 0)),
      has_certificate: true,
    });
  }
  for (let i = 0; i < 8; i++) {
    rows.push({
      organization_id: certificateOrganizationId,
      name: `futuro ${i}`,
      expiration_date: day(31 + i),
      has_certificate: false,
    });
  }
  rows.push({
    organization_id: "outra-org",
    name: "outra",
    expiration_date: day(-3),
    has_certificate: true,
  });
  return rows;
}

describe("certificate list summary", () => {
  it("counts KPIs over every page, not only the returned one (PJ)", async () => {
    const service = new CertificatePjService({ certificatePJ: fakeDelegate(buildRows()) } as never);

    const result = await service.listCertificatePj({
      organizationId: certificateOrganizationId,
      query: { page: 1, page_size: 20 },
      now,
    });

    expect(result.items).toHaveLength(20);
    expect(result.total).toBe(45);
    expect(result.summary).toEqual({ expired: 25, expiring_30_days: 12, with_certificate: 17 });
  });

  it("applies the active filters to the KPIs (PJ)", async () => {
    const service = new CertificatePjService({ certificatePJ: fakeDelegate(buildRows()) } as never);

    const result = await service.listCertificatePj({
      organizationId: certificateOrganizationId,
      query: { name: "pezinho", page: 1, page_size: 20 },
      now,
    });

    expect(result.summary).toEqual({ expired: 0, expiring_30_days: 12, with_certificate: 12 });
  });

  it("keeps an explicit has_certificate filter in the with_certificate KPI", async () => {
    const service = new CertificatePjService({ certificatePJ: fakeDelegate(buildRows()) } as never);

    const result = await service.listCertificatePj({
      organizationId: certificateOrganizationId,
      query: { has_certificate: false, page: 1, page_size: 20 },
      now,
    });

    expect(result.summary.with_certificate).toBe(0);
  });

  it("counts KPIs over every page (PF)", async () => {
    const service = new CertificatePfService({ certificatePF: fakeDelegate(buildRows()) } as never);

    const result = await service.listCertificatePf({
      organizationId: certificateOrganizationId,
      query: { page: 3, page_size: 20 },
      now,
    });

    expect(result.items).toHaveLength(5);
    expect(result.summary).toEqual({ expired: 25, expiring_30_days: 12, with_certificate: 17 });
  });
});
