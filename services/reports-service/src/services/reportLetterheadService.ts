import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { ServiceError, warn } from "@workspace/shared";

export type ReportLetterheadKind = "organization" | "department";

export interface ReportLetterheadAsset {
  kind: ReportLetterheadKind;
  organizationId: string;
  departmentId?: string;
  bytes?: Buffer;
  filePath?: string;
  sha256: string;
}

export interface SelectedReportLetterhead {
  kind: ReportLetterheadKind | "institutional";
  bytes?: Buffer;
  sha256?: string;
  warning?: string;
}

export interface SelectReportLetterheadInput {
  organizationId: string;
  departmentId?: string;
  scope: "personal" | "shared";
}

const FALLBACK_WARNING = "Timbrado aprovado ausente; usando fallback institucional.";

export class ReportLetterheadService {
  constructor(
    private readonly assets: readonly ReportLetterheadAsset[] = [],
    private readonly onWarning: (message: string) => void = (message) => {
      warn(message, { event: "reports.letterhead.fallback" });
    },
  ) {}

  async select(input: SelectReportLetterheadInput): Promise<SelectedReportLetterhead> {
    const asset = this.findAsset(input);
    if (!asset) {
      this.onWarning(FALLBACK_WARNING);
      return { kind: "institutional", warning: FALLBACK_WARNING };
    }

    const bytes = asset.bytes ?? (asset.filePath ? await readFile(asset.filePath) : undefined);
    if (!bytes) {
      throw new ServiceError(500, "Timbrado aprovado sem conteúdo.");
    }

    const actualSha256 = createHash("sha256").update(bytes).digest("hex");
    if (actualSha256 !== asset.sha256.trim().toLowerCase()) {
      throw new ServiceError(500, "SHA-256 do timbrado inválido.");
    }

    return { kind: asset.kind, bytes, sha256: actualSha256, warning: undefined };
  }

  private findAsset(input: SelectReportLetterheadInput): ReportLetterheadAsset | undefined {
    if (input.scope === "shared" && input.departmentId) {
      return this.assets.find(
        (asset) =>
          asset.kind === "department" &&
          asset.organizationId === input.organizationId &&
          asset.departmentId === input.departmentId,
      );
    }

    if (input.scope === "personal") {
      return this.assets.find(
        (asset) => asset.kind === "organization" && asset.organizationId === input.organizationId,
      );
    }

    return undefined;
  }
}
