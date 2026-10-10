import { createHash } from "node:crypto";
import { ServiceError } from "@workspace/shared";
import { CONTABIL_READ_PERMISSION, CONTABIL_WRITE_PERMISSION } from "../constants/permissions.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import { convertNoahZip } from "./noahConversionService.js";

export type NoahServicePrisma = Pick<PrismaClient, "noahConversion">;
export interface NoahAuthContext {
  userId: string;
  organizationId: string;
  permission?: number;
}
type NoahRecord = Awaited<ReturnType<NoahServicePrisma["noahConversion"]["create"]>>;
export type NoahReceipt = Omit<NoahRecord, "csv" | "organization_id">;

function requireAccess(auth: NoahAuthContext, minimum: number): void {
  if (!auth.userId || !auth.organizationId || (auth.permission ?? 0) < minimum) {
    throw new ServiceError(403, "Permissão insuficiente para a conversão Noah.");
  }
}

export class NoahService {
  constructor(private readonly prisma: NoahServicePrisma) {}

  async create(bytes: Buffer, name: string, auth: NoahAuthContext): Promise<NoahReceipt> {
    requireAccess(auth, CONTABIL_WRITE_PERMISSION);
    const converted = await convertNoahZip(bytes);
    const record = await this.prisma.noahConversion.create({
      data: {
        organization_id: auth.organizationId,
        created_by: auth.userId,
        source_name: name,
        source_sha256: createHash("sha256").update(bytes).digest("hex"),
        result_sha256: createHash("sha256").update(converted.csv).digest("hex"),
        csv: converted.csv,
        row_count: converted.rowCount,
        file_count: converted.fileCount,
        rejections: converted.rejections,
      },
    });
    const { csv: _csv, organization_id: _organizationId, ...receipt } = record;
    return receipt;
  }

  async download(id: string, auth: NoahAuthContext): Promise<string> {
    requireAccess(auth, CONTABIL_READ_PERMISSION);
    const result = await this.prisma.noahConversion.findFirst({
      where: { id, organization_id: auth.organizationId },
      select: { csv: true },
    });
    if (!result) throw new ServiceError(404, "Conversão não encontrada.");
    return result.csv;
  }
}
