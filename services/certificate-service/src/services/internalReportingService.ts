import { createHash } from "node:crypto";

import { ServiceError } from "@workspace/shared";

import type { PrismaClient } from "../generated/prisma/client.js";
import {
  type CertificatePfReportingSource,
  getCertificatePfReportingFields,
} from "../reporting/certificatePfReportingCatalog.js";
import {
  type CertificatePjReportingSource,
  getCertificatePjReportingFields,
} from "../reporting/certificatePjReportingCatalog.js";

type ReportingDelegate = {
  findMany(input: {
    where: { organization_id: string };
    select: Record<string, true>;
    take: number;
  }): Promise<readonly Record<string, unknown>[]>;
};

export class InternalReportingService {
  constructor(private readonly prisma: PrismaClient) {}

  async consumeGrant(grant: string, expiresAt: number): Promise<void> {
    const now = new Date();
    await this.prisma.reportGrantUse.deleteMany({ where: { expires_at: { lte: now } } });
    try {
      await this.prisma.reportGrantUse.create({
        data: {
          grant_hash: createHash("sha256").update(grant).digest("hex"),
          expires_at: new Date(expiresAt * 1000),
        },
      });
    } catch (error: unknown) {
      if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
        throw new ServiceError(403, "Grant de relatórios já utilizado.");
      }
      throw error;
    }
  }

  async extract(input: {
    organizationId: string;
    source: CertificatePfReportingSource | CertificatePjReportingSource;
    fields: readonly string[];
    limit: number;
  }): Promise<{ rows: readonly Record<string, unknown>[]; reachedLimit: boolean }> {
    const allowedFields =
      input.source === "certificado.pf"
        ? getCertificatePfReportingFields(input.source)
        : getCertificatePjReportingFields(input.source);
    if (input.fields.some((field) => !allowedFields.includes(field))) {
      throw new ServiceError(403, "Campo não publicado para relatórios.");
    }

    const delegate =
      input.source === "certificado.pf" ? this.prisma.certificatePF : this.prisma.certificatePJ;
    const rows = await (delegate as unknown as ReportingDelegate).findMany({
      where: { organization_id: input.organizationId },
      select: Object.fromEntries(input.fields.map((field) => [field, true])),
      take: input.limit + 1,
    });

    return {
      rows: rows
        .slice(0, input.limit)
        .map((row) =>
          Object.fromEntries(
            input.fields
              .filter((field) => Object.getOwnPropertyDescriptor(row, field) !== undefined)
              .map((field) => [field, row[field]]),
          ),
        ),
      reachedLimit: rows.length > input.limit,
    };
  }
}
