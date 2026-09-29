import { type EncryptionService, ServiceError } from "@workspace/shared";
import type { PrismaClient } from "../generated/prisma/client.js";

export interface MarketingPasswordInput {
  local: string;
  user: string;
  password: string;
  notes?: string | null;
}

export interface MarketingPasswordUpdateInput {
  local?: string;
  user?: string;
  password?: string;
  notes?: string | null;
}

export interface MarketingLegacyPasswordRecord {
  organization_id?: unknown;
  local?: unknown;
  user?: unknown;
  password?: unknown;
  notes?: unknown;
}

type PasswordMetadata = {
  id: string;
  local: string;
  user: string;
  notes: string | null;
  createdAt?: Date;
  updatedAt?: Date;
};

type PasswordRecord = PasswordMetadata & { password?: string };

const METADATA_SELECT = {
  id: true,
  local: true,
  user: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  password: true,
} as const;

function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === "P2002",
  );
}

function toMetadata(record: PasswordMetadata): PasswordMetadata {
  return {
    id: record.id,
    local: record.local,
    user: record.user,
    notes: record.notes,
    ...(record.createdAt ? { createdAt: record.createdAt } : {}),
    ...(record.updatedAt ? { updatedAt: record.updatedAt } : {}),
  };
}

function normalizedIdentity(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

type ImportCandidate = {
  source: unknown;
  local: string;
  user: string;
  password: string;
  plaintext: string;
  notes: string | null;
};

export class MarketingPasswordService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly encryption: EncryptionService,
  ) {}

  async list(organizationId: string): Promise<PasswordMetadata[]> {
    const records = await this.prisma.passwordMkt.findMany({
      where: { organization_id: organizationId },
      select: { ...METADATA_SELECT },
      orderBy: [{ local: "asc" }, { user: "asc" }],
    });
    return records.map((record) => this.safeMetadata(record as PasswordRecord));
  }

  async detail(organizationId: string, id: string): Promise<PasswordMetadata> {
    const record = await this.prisma.passwordMkt.findFirst({
      where: { id, organization_id: organizationId },
      select: { ...METADATA_SELECT },
    });
    if (!record) throw new ServiceError(404, "Credencial não encontrada.");
    return this.safeMetadata(record as PasswordRecord);
  }

  async create(organizationId: string, input: MarketingPasswordInput): Promise<PasswordMetadata> {
    this.assertNotesDoNotContainSecret(input.notes, input.password);
    await this.assertIdentityAvailable(input.local, input.user);
    try {
      const record = await this.prisma.passwordMkt.create({
        data: {
          organization_id: organizationId,
          local: input.local.trim(),
          user: input.user.trim(),
          password: this.encryption.encrypt(input.password),
          notes: input.notes?.trim() || null,
        },
        select: { ...METADATA_SELECT },
      });
      return toMetadata(record as PasswordMetadata);
    } catch (error: unknown) {
      if (isUniqueConstraintError(error)) {
        throw new ServiceError(409, "Já existe uma credencial para este local e usuário.");
      }
      throw error;
    }
  }

  async update(
    organizationId: string,
    id: string,
    input: MarketingPasswordUpdateInput,
  ): Promise<PasswordMetadata> {
    const existing = await this.prisma.passwordMkt.findFirst({
      where: { id, organization_id: organizationId },
      select: { id: true, local: true, user: true, password: true },
    });
    if (!existing) throw new ServiceError(404, "Credencial não encontrada.");

    const local = input.local?.trim() || existing.local;
    const user = input.user?.trim() || existing.user;
    await this.assertIdentityAvailable(local, user, id);
    if (input.notes !== undefined) {
      let currentSecret: string;
      try {
        currentSecret = this.encryption.decrypt(existing.password);
      } catch {
        throw new ServiceError(422, "A credencial não pode ser validada com a chave do Office.");
      }
      this.assertNotesDoNotContainSecret(input.notes, input.password ?? currentSecret);
    }

    try {
      const record = await this.prisma.passwordMkt.update({
        where: { id, organization_id: organizationId },
        data: {
          local,
          user,
          ...(input.password !== undefined
            ? { password: this.encryption.encrypt(input.password) }
            : {}),
          ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
        },
        select: { ...METADATA_SELECT },
      });
      return toMetadata(record as PasswordMetadata);
    } catch (error: unknown) {
      if (isUniqueConstraintError(error)) {
        throw new ServiceError(409, "Já existe uma credencial para este local e usuário.");
      }
      throw error;
    }
  }

  async reveal(
    organizationId: string,
    id: string,
    confirmed: boolean,
  ): Promise<{ password: string }> {
    if (!confirmed) throw new ServiceError(400, "Confirme explicitamente a revelação.");
    const record = await this.findEncrypted(organizationId, id);
    try {
      return { password: this.encryption.decrypt(record.password) };
    } catch {
      throw new ServiceError(422, "A credencial não pode ser validada com a chave do Office.");
    }
  }

  async export(
    organizationId: string,
    id: string,
    confirmed: boolean,
  ): Promise<PasswordMetadata & { password: string }> {
    if (!confirmed) throw new ServiceError(400, "Confirme explicitamente a exportação.");
    const [metadata, secret] = await Promise.all([
      this.detail(organizationId, id),
      this.reveal(organizationId, id, true),
    ]);
    return { ...metadata, password: secret.password };
  }

  async importLegacyRecords(
    organizationId: string,
    values: unknown[],
  ): Promise<{ imported: number; quarantined: number }> {
    const candidates: ImportCandidate[] = [];
    const quarantined: Array<{ source: unknown; reason: string }> = [];

    for (const value of values) {
      const raw = value;
      const source =
        value && typeof value === "object" && !Array.isArray(value)
          ? (value as MarketingLegacyPasswordRecord)
          : {};
      const local = normalizedIdentity(source.local);
      const user = normalizedIdentity(source.user);
      const encrypted = typeof source.password === "string" ? source.password : null;
      const notes = typeof source.notes === "string" ? source.notes : null;

      if (!source.organization_id) {
        quarantined.push({ source: raw, reason: "missing_organization_link" });
        continue;
      }
      if (source.organization_id !== organizationId) {
        quarantined.push({ source: raw, reason: "organization_mismatch" });
        continue;
      }
      if (!local || !user) {
        quarantined.push({ source: raw, reason: "missing_credential_identity" });
        continue;
      }
      if (!encrypted) {
        quarantined.push({ source: raw, reason: "ambiguous_secret" });
        continue;
      }

      let plaintext: string;
      try {
        plaintext = this.encryption.decrypt(encrypted);
      } catch {
        quarantined.push({ source: raw, reason: "invalid_encrypted_secret" });
        continue;
      }
      if (!plaintext || (notes && (notes.includes(plaintext) || notes.includes(encrypted)))) {
        quarantined.push({ source: raw, reason: "secret_duplicated_in_notes" });
        continue;
      }
      candidates.push({ source: raw, local, user, password: encrypted, plaintext, notes });
    }

    const identityCounts = new Map<string, number>();
    for (const candidate of candidates) {
      const identity = JSON.stringify([candidate.local, candidate.user]);
      identityCounts.set(identity, (identityCounts.get(identity) ?? 0) + 1);
    }

    const imported: ImportCandidate[] = [];
    for (const candidate of candidates) {
      const identity = JSON.stringify([candidate.local, candidate.user]);
      if ((identityCounts.get(identity) ?? 0) > 1) {
        quarantined.push({ source: candidate.source, reason: "duplicate_in_import" });
        continue;
      }
      const existing = await this.prisma.passwordMkt.findFirst({
        where: {
          local: candidate.local,
          user: candidate.user,
        },
        select: { id: true },
      });
      if (existing) {
        quarantined.push({ source: candidate.source, reason: "duplicate_existing_credential" });
        continue;
      }

      try {
        await this.prisma.passwordMkt.create({
          data: {
            organization_id: organizationId,
            local: candidate.local,
            user: candidate.user,
            password: this.encryption.encrypt(candidate.plaintext),
            notes: candidate.notes,
          },
          select: { id: true },
        });
        imported.push(candidate);
      } catch (error: unknown) {
        if (!isUniqueConstraintError(error)) throw error;
        quarantined.push({ source: candidate.source, reason: "duplicate_existing_credential" });
      }
    }

    if (quarantined.length > 0) {
      await this.prisma.marketingPasswordImportReconciliation.createMany({
        data: quarantined.map(({ source, reason }) => ({
          organization_id: organizationId,
          encrypted_payload: this.encryption.encrypt(JSON.stringify(source ?? null)),
          reason,
        })),
      });
    }

    return { imported: imported.length, quarantined: quarantined.length };
  }

  async listImportReconciliation(
    organizationId: string,
  ): Promise<Array<{ id: string; reason: string; status: string; created_at: Date }>> {
    return this.prisma.marketingPasswordImportReconciliation.findMany({
      where: { organization_id: organizationId },
      select: { id: true, reason: true, status: true, created_at: true },
      orderBy: { created_at: "desc" },
    });
  }

  private async assertIdentityAvailable(
    local: string,
    user: string,
    exceptId?: string,
  ): Promise<void> {
    const duplicate = await this.prisma.passwordMkt.findFirst({
      where: {
        local: local.trim(),
        user: user.trim(),
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new ServiceError(409, "Já existe uma credencial para este local e usuário.");
    }
  }

  private safeMetadata(record: PasswordRecord): PasswordMetadata {
    let notes = record.notes;
    if (record.password) {
      try {
        const secret = this.encryption.decrypt(record.password);
        if (secret && notes && (notes.includes(secret) || notes.includes(record.password))) {
          notes = null;
        }
      } catch {
        notes = null;
      }
    }
    return toMetadata({ ...record, notes });
  }

  private assertNotesDoNotContainSecret(notes: string | null | undefined, secret: string): void {
    if (notes?.includes(secret)) {
      throw new ServiceError(400, "As observações não podem conter a senha.");
    }
  }

  private async findEncrypted(organizationId: string, id: string): Promise<{ password: string }> {
    const record = await this.prisma.passwordMkt.findFirst({
      where: { id, organization_id: organizationId },
      select: { password: true },
    });
    if (!record) throw new ServiceError(404, "Credencial não encontrada.");
    return record;
  }
}
