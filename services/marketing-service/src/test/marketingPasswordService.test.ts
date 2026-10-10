import { EncryptionService } from "@workspace/shared";
import { describe, expect, it, vi } from "vitest";

import { MarketingPasswordService } from "../services/marketingPasswordService.js";

const encryptionKey = Buffer.alloc(32, 7).toString("base64");
const organizationId = "10000000-0000-4000-8000-000000000001";

const actorUserId = "20000000-0000-4000-8000-000000000009";

function createPrisma() {
  const prisma = {
    passwordMkt: {
      findMany: vi.fn(async () => []),
      findFirst: vi.fn(async () => null),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: "credential-1",
        ...data,
      })),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: "credential-1",
        ...data,
      })),
    },
    marketingPasswordImportReconciliation: {
      createMany: vi.fn(async () => ({ count: 0 })),
      findMany: vi.fn(async () => []),
    },
    $transaction: vi.fn((run: (tx: unknown) => unknown) => run(prisma)),
  };
  return prisma;
}

describe("MarketingPasswordService", () => {
  it("stores credentials encrypted and never includes the secret in list results", async () => {
    const prisma = createPrisma();
    const service = new MarketingPasswordService(
      prisma as never,
      new EncryptionService(encryptionKey),
      vi.fn(async () => {}),
    );

    const created = await service.create(
      organizationId,
      {
        local: "Instagram",
        user: "acme@example.com",
        password: "sensitive-secret",
        notes: "Conta oficial",
      },
      actorUserId,
    );

    expect(created).toEqual({
      id: "credential-1",
      local: "Instagram",
      user: "acme@example.com",
      notes: "Conta oficial",
    });
    const encrypted = prisma.passwordMkt.create.mock.calls[0]?.[0].data.password as string;
    expect(encrypted).not.toBe("sensitive-secret");
    expect(new EncryptionService(encryptionKey).decrypt(encrypted)).toBe("sensitive-secret");

    prisma.passwordMkt.findMany.mockResolvedValueOnce([
      {
        id: "credential-1",
        local: "Instagram",
        user: "acme@example.com",
        notes: null,
        password: encrypted,
      },
    ]);
    const listed = await service.list(organizationId);
    expect(listed).toEqual([
      { id: "credential-1", local: "Instagram", user: "acme@example.com", notes: null },
    ]);
    expect(JSON.stringify(listed)).not.toContain("sensitive-secret");
  });

  it("requires explicit confirmation before revealing a secret", async () => {
    const prisma = createPrisma();
    const encryption = new EncryptionService(encryptionKey);
    const service = new MarketingPasswordService(
      prisma as never,
      encryption,
      vi.fn(async () => {}),
    );
    const encrypted = encryption.encrypt("sensitive-secret");
    prisma.passwordMkt.findFirst.mockResolvedValue({
      id: "credential-1",
      organization_id: organizationId,
      password: encrypted,
    } as never);

    await expect(
      service.reveal(organizationId, "credential-1", false, actorUserId),
    ).rejects.toMatchObject({
      statusCode: 400,
    });
    await expect(
      service.reveal(organizationId, "credential-1", true, actorUserId),
    ).resolves.toEqual({
      password: "sensitive-secret",
    });
  });

  it("rejects duplicate local and user identities across organizations", async () => {
    const prisma = createPrisma();
    prisma.passwordMkt.findFirst.mockResolvedValueOnce({
      id: "credential-existing",
      organization_id: "another-organization",
    } as never);
    const service = new MarketingPasswordService(
      prisma as never,
      new EncryptionService(encryptionKey),
      vi.fn(async () => {}),
    );

    await expect(
      service.create(
        organizationId,
        {
          local: "Instagram",
          user: "acme@example.com",
          password: "sensitive-secret",
        },
        actorUserId,
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(prisma.passwordMkt.create).not.toHaveBeenCalled();
    expect(prisma.passwordMkt.findFirst).toHaveBeenCalledWith({
      where: {
        local: "Instagram",
        user: "acme@example.com",
      },
      select: { id: true },
    });
  });

  it("refuses to save a secret duplicated in notes", async () => {
    const prisma = createPrisma();
    const service = new MarketingPasswordService(
      prisma as never,
      new EncryptionService(encryptionKey),
      vi.fn(async () => {}),
    );

    await expect(
      service.create(
        organizationId,
        {
          local: "Instagram",
          user: "acme@example.com",
          password: "sensitive-secret",
          notes: "Temporary password: sensitive-secret",
        },
        actorUserId,
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(prisma.passwordMkt.create).not.toHaveBeenCalled();
  });

  it("redacts legacy notes if they contain the decrypted password", async () => {
    const prisma = createPrisma();
    const encryption = new EncryptionService(encryptionKey);
    prisma.passwordMkt.findMany.mockResolvedValueOnce([
      {
        id: "credential-1",
        local: "Instagram",
        user: "acme@example.com",
        notes: "Old password: legacy-secret",
        password: encryption.encrypt("legacy-secret"),
      },
    ] as never);
    const service = new MarketingPasswordService(
      prisma as never,
      encryption,
      vi.fn(async () => {}),
    );

    const listed = await service.list(organizationId);

    expect(listed[0]?.notes).toBeNull();
    expect(JSON.stringify(listed)).not.toContain("legacy-secret");
  });

  it("imports verifiable Office ciphertext and encrypts all quarantined payloads", async () => {
    const prisma = createPrisma();
    const encryption = new EncryptionService(encryptionKey);
    const audit = vi.fn(async () => {});
    const service = new MarketingPasswordService(prisma as never, encryption, audit);
    const validSecret = "verified-secret";
    const duplicatedSecret = "duplicate-secret";
    const result = await service.importLegacyRecords(
      organizationId,
      [
        {
          organization_id: organizationId,
          local: "Instagram",
          user: "acme@example.com",
          password: encryption.encrypt(validSecret),
          notes: "Conta oficial",
        },
        { organization_id: null, local: "Facebook", user: "acme", password: "plain-secret" },
        {
          organization_id: organizationId,
          local: "LinkedIn",
          user: "acme",
          password: encryption.encrypt(duplicatedSecret),
        },
        {
          organization_id: organizationId,
          local: "LinkedIn",
          user: "acme",
          password: encryption.encrypt(duplicatedSecret),
        },
      ],
      actorUserId,
    );

    expect(result).toEqual({ imported: 1, quarantined: 3 });
    expect(audit).toHaveBeenCalledTimes(1);
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId,
        userId: actorUserId,
        action: "Importação",
        referring: "marketing.passwords",
        referringId: "credential-1",
      }),
    );
    expect(JSON.stringify(audit.mock.calls)).not.toContain(validSecret);
    const importedCiphertext = prisma.passwordMkt.create.mock.calls[0]?.[0].data.password as string;
    expect(encryption.decrypt(importedCiphertext)).toBe(validSecret);
    const quarantine = prisma.marketingPasswordImportReconciliation.createMany.mock.calls[0]?.[0]
      .data as Array<{ encrypted_payload: string; reason: string }>;
    expect(quarantine.map(({ reason }) => reason)).toEqual([
      "missing_organization_link",
      "duplicate_in_import",
      "duplicate_in_import",
    ]);
    for (const entry of quarantine) {
      const serialized = encryption.decrypt(entry.encrypted_payload);
      expect(serialized).not.toContain(validSecret);
      expect(serialized).not.toContain(duplicatedSecret);
    }
  });

  it("quarantines invalid ciphertext, cross-tenant links, and secrets duplicated in notes", async () => {
    const prisma = createPrisma();
    const encryption = new EncryptionService(encryptionKey);
    const service = new MarketingPasswordService(
      prisma as never,
      encryption,
      vi.fn(async () => {}),
    );
    const noteSecret = "note-secret";
    const result = await service.importLegacyRecords(
      organizationId,
      [
        {
          organization_id: organizationId,
          local: "Instagram",
          user: "acme",
          password: encryption.encrypt(noteSecret),
          notes: `Do not share ${noteSecret}`,
        },
        {
          organization_id: organizationId,
          local: "Facebook",
          user: "acme",
          password: "not-office-ciphertext",
        },
        {
          organization_id: "another-organization",
          local: "LinkedIn",
          user: "acme",
          password: encryption.encrypt("other-tenant-secret"),
        },
      ],
      actorUserId,
    );

    expect(result).toEqual({ imported: 0, quarantined: 3 });
    const quarantine = prisma.marketingPasswordImportReconciliation.createMany.mock.calls[0]?.[0]
      .data as Array<{ encrypted_payload: string; reason: string }>;
    expect(quarantine.map(({ reason }) => reason)).toEqual([
      "secret_duplicated_in_notes",
      "invalid_encrypted_secret",
      "organization_mismatch",
    ]);
    expect(JSON.stringify(quarantine)).not.toContain(noteSecret);
    expect(JSON.stringify(quarantine)).not.toContain("other-tenant-secret");
  });

  it("never copies a secret kept in legacy notes into the trail when the notes change", async () => {
    const prisma = createPrisma();
    const encryption = new EncryptionService(encryptionKey);
    const audit = vi.fn(async () => {});
    const service = new MarketingPasswordService(prisma as never, encryption, audit);
    prisma.passwordMkt.findFirst
      .mockResolvedValueOnce({
        id: "credential-1",
        local: "Instagram",
        user: "acme",
        notes: "Senha antiga: legacy-secret",
        password: encryption.encrypt("legacy-secret"),
      } as never)
      .mockResolvedValueOnce(null);

    await service.update(organizationId, "credential-1", { notes: "Conta oficial" }, actorUserId);

    expect(JSON.stringify(audit.mock.calls)).not.toContain("legacy-secret");
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "Edição",
        changes: { notes: { from: null, to: "Conta oficial" } },
      }),
    );
  });

  it("refuses a new password that the kept notes already contain", async () => {
    const prisma = createPrisma();
    const encryption = new EncryptionService(encryptionKey);
    const audit = vi.fn(async () => {});
    const service = new MarketingPasswordService(prisma as never, encryption, audit);
    prisma.passwordMkt.findFirst.mockResolvedValueOnce({
      id: "credential-1",
      local: "Instagram",
      user: "acme",
      notes: "Próxima senha: next-secret",
      password: encryption.encrypt("old-secret"),
    } as never);

    await expect(
      service.update(organizationId, "credential-1", { password: "next-secret" }, actorUserId),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(prisma.passwordMkt.update).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it("redacts legacy notes holding the secret from the update response", async () => {
    const prisma = createPrisma();
    const encryption = new EncryptionService(encryptionKey);
    const encrypted = encryption.encrypt("kept-secret");
    const service = new MarketingPasswordService(
      prisma as never,
      encryption,
      vi.fn(async () => {}),
    );
    prisma.passwordMkt.findFirst
      .mockResolvedValueOnce({
        id: "credential-1",
        local: "Instagram",
        user: "acme",
        notes: "senha kept-secret",
        password: encrypted,
      } as never)
      .mockResolvedValueOnce(null);
    prisma.passwordMkt.update.mockResolvedValueOnce({
      id: "credential-1",
      local: "Instagram novo",
      user: "acme",
      notes: "senha kept-secret",
      password: encrypted,
    } as never);

    const updated = await service.update(
      organizationId,
      "credential-1",
      { local: "Instagram novo" },
      actorUserId,
    );

    expect(JSON.stringify(updated)).not.toContain("kept-secret");
    expect(updated.notes).toBeNull();
  });
});
