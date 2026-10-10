import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { NoahService, type NoahServicePrisma } from "../services/noahService.js";
import { noahZip } from "./noahFixtures.js";

const auth = { userId: "actor", organizationId: "organization-a", permission: 2 };

describe("NoahService", () => {
  it("preserva CSV, hashes e auditoria e só permite recuperar na organização original", async () => {
    let saved: Record<string, unknown> | undefined;
    const database = {
      noahConversion: {
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          saved = { ...data, id: "conversion", created_at: new Date("2026-10-09T12:00:00Z") };
          return saved;
        }),
        findFirst: vi.fn(async ({ where }: { where: { organization_id: string } }) =>
          saved?.organization_id === where.organization_id ? saved : null,
        ),
      },
    };
    const service = new NoahService(database as unknown as NoahServicePrisma);
    const bytes = await noahZip();
    const result = await service.create(bytes, "noah.zip", auth);
    expect(result).toMatchObject({
      id: "conversion",
      row_count: 2,
      file_count: 1,
      rejections: [],
      created_by: "actor",
      source_sha256: createHash("sha256").update(bytes).digest("hex"),
    });
    expect(result).not.toHaveProperty("csv");
    const csv = await service.download(result.id, auth);
    expect(csv).toContain("Fornecedor & Cia;09/10/2026;1.234,56;comprovante.html");
    expect(result.result_sha256).toBe(createHash("sha256").update(csv).digest("hex"));
    await expect(
      service.download(result.id, { ...auth, organizationId: "organization-b" }),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(database.noahConversion.create).toHaveBeenCalledTimes(1);
  });

  it("bloqueia escrita sem edição e leitura sem acesso ao Contábil antes de acessar dados", async () => {
    const service = new NoahService({} as NoahServicePrisma);
    await expect(
      service.create(Buffer.alloc(0), "noah.zip", { ...auth, permission: 1 }),
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.download("conversion", { ...auth, permission: 0 })).rejects.toMatchObject({
      statusCode: 403,
    });
  });
});
