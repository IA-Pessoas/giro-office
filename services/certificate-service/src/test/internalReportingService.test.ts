import "./envBootstrap.js";

import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { InternalReportingService } from "../services/internalReportingService.js";

const organizationId = "10000000-0000-4000-8000-000000000001";

describe("InternalReportingService", () => {
  it("registra o grant em armazenamento persistente e rejeita replay", async () => {
    const deleteMany = vi.fn().mockResolvedValue({ count: 0 });
    const create = vi.fn().mockResolvedValue({});
    const service = new InternalReportingService({
      reportGrantUse: { deleteMany, create },
    } as never);

    await expect(service.consumeGrant("grant-838", 2_000_000_000)).resolves.toBeUndefined();
    expect(deleteMany).toHaveBeenCalledWith({ where: { expires_at: { lte: expect.any(Date) } } });
    expect(create).toHaveBeenCalledWith({
      data: {
        grant_hash: createHash("sha256").update("grant-838").digest("hex"),
        expires_at: new Date(2_000_000_000 * 1000),
      },
    });

    create.mockRejectedValueOnce(Object.assign(new Error("duplicate"), { code: "P2002" }));
    await expect(service.consumeGrant("grant-838", 2_000_000_000)).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it("filtra PF por organização, projeta campos publicados e informa limite", async () => {
    const findMany = vi.fn().mockResolvedValue([
      { name: "Pessoa 1", was_paid: true, id: "nao-publicar", password: "nao-publicar" },
      { name: "Pessoa 2", was_paid: false },
      { name: "Pessoa 3", was_paid: true },
    ]);
    const service = new InternalReportingService({ certificatePF: { findMany } } as never);

    await expect(
      service.extract({
        organizationId,
        source: "certificado.pf",
        fields: ["name", "was_paid"],
        limit: 2,
      }),
    ).resolves.toEqual({
      rows: [
        { name: "Pessoa 1", was_paid: true },
        { name: "Pessoa 2", was_paid: false },
      ],
      reachedLimit: true,
    });

    expect(findMany).toHaveBeenCalledWith({
      where: { organization_id: organizationId },
      select: { name: true, was_paid: true },
      take: 3,
    });
  });

  it("filtra PJ por organização, projeta campos publicados e informa limite", async () => {
    const findMany = vi.fn().mockResolvedValue([
      { name: "Empresa 1", was_paid: true, id: "nao-publicar", password: "nao-publicar" },
      { name: "Empresa 2", was_paid: false },
      { name: "Empresa 3", was_paid: true },
    ]);
    const service = new InternalReportingService({ certificatePJ: { findMany } } as never);

    await expect(
      service.extract({
        organizationId,
        source: "certificado.pj",
        fields: ["name", "was_paid"],
        limit: 2,
      }),
    ).resolves.toEqual({
      rows: [
        { name: "Empresa 1", was_paid: true },
        { name: "Empresa 2", was_paid: false },
      ],
      reachedLimit: true,
    });

    expect(findMany).toHaveBeenCalledWith({
      where: { organization_id: organizationId },
      select: { name: true, was_paid: true },
      take: 3,
    });
  });

  it("rejeita projeção não publicada sem consultar o banco", async () => {
    const findMany = vi.fn();
    const service = new InternalReportingService({
      certificatePF: { findMany },
      certificatePJ: { findMany },
    } as never);

    await expect(
      service.extract({
        organizationId,
        source: "certificado.pf",
        fields: ["id"],
        limit: 10,
      }),
    ).rejects.toMatchObject({ statusCode: 403 });

    await expect(
      service.extract({
        organizationId,
        source: "certificado.pj",
        fields: ["id"],
        limit: 10,
      }),
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(findMany).not.toHaveBeenCalled();
  });
});
