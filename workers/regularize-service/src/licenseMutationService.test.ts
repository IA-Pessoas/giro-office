import { describe, expect, it, vi } from "vitest";
import type { RegularizeWorkerEnv } from "./env.js";
import {
  createLicenseMutationService,
  type LicenseMutationPrisma,
} from "./licenseMutationService.js";

const organizationId = "a0000000-0000-4000-8000-000000000001";
const userId = "b0000000-0000-4000-8000-000000000001";
const licenseId = "c0000000-0000-4000-8000-000000000001";

const environment: RegularizeWorkerEnv = {
  JWT_SECRET: "regularize-worker-test-secret-which-is-long-enough",
  INTERNAL_SERVICE_TOKEN: "regularize-gateway-token",
  HYPERDRIVE: { connectionString: "postgresql://worker:test@db.example/giro" },
};

describe("regularize license mutations", () => {
  it("creates a license in the authenticated organization and records the change", async () => {
    const created = {
      id: licenseId,
      organization_id: organizationId,
      has: true,
      type_license: "Alvará",
      protocol: "PROTO-1",
      status: "Em Andamento",
    };
    const prisma = {
      $queryRaw: vi.fn(async () => []),
      $executeRaw: vi.fn(async () => 1),
      license: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async () => created),
        update: vi.fn(),
      },
    } as unknown as LicenseMutationPrisma;
    const service = createLicenseMutationService(prisma, environment);

    const result = await service.create({
      organizationId,
      userId,
      body: {
        has: true,
        type_license: "Alvará",
        entry_date: new Date("2026-09-22T00:00:00.000Z"),
        protocol: "PROTO-1",
        status: "Em Andamento",
        current_situation: "Em análise",
        contact: "contato@example.com",
        urgency: "Normal",
        type: "Municipal",
      },
    });

    expect(result).toMatchObject({ id: licenseId, protocol: "PROTO-1" });
    expect(prisma.license.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ organization_id: organizationId }),
      }),
    );
    expect(prisma.$executeRaw).toHaveBeenCalledOnce();
  });
});
