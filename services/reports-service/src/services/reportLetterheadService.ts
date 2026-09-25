/// <reference path="../pdfkitStandalone.d.ts" />
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { inflateSync } from "node:zlib";

import { ServiceError, warn } from "@workspace/shared";
import PdfDocument from "pdfkit/js/pdfkit.standalone.js";

export type ReportLetterheadKind = "organization" | "department";

export interface ReportLetterheadAsset {
  id?: string;
  label?: string;
  status?: "active" | "invalid";
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
  selected?: { id: string; sha256: string };
}

export interface ReportLetterheadOption {
  id: string;
  label: string;
  kind: ReportLetterheadKind;
  sha256: string;
}

const FALLBACK_WARNING = "Timbrado aprovado ausente; usando fallback institucional.";

export class ReportLetterheadService {
  constructor(
    private readonly assets: readonly ReportLetterheadAsset[] = [],
    private readonly onWarning: (message: string) => void = (message) => {
      warn(message, { event: "reports.letterhead.fallback" });
    },
  ) {}

  async list(input: SelectReportLetterheadInput): Promise<ReportLetterheadOption[]> {
    const options: ReportLetterheadOption[] = [];
    const ids = new Set<string>();
    const hashes = new Set<string>();
    for (const asset of this.assets) {
      const sha256 = asset.sha256.trim().toLowerCase();
      if (
        !asset.id ||
        !asset.label?.trim() ||
        asset.status === "invalid" ||
        ids.has(asset.id) ||
        hashes.has(sha256)
      )
        continue;
      if (!this.isAuthorized(asset, input)) continue;
      try {
        const bytes = await this.readAsset(asset);
        if (!this.isSupportedImage(bytes)) continue;
        options.push({
          id: asset.id,
          label: asset.label.trim(),
          kind: asset.kind,
          sha256,
        });
        ids.add(asset.id);
        hashes.add(sha256);
      } catch {
        // Ativos inválidos e indisponíveis não entram no catálogo.
      }
    }
    return options;
  }

  async select(input: SelectReportLetterheadInput): Promise<SelectedReportLetterhead> {
    const selected = input.selected;
    if (selected) {
      const option = (await this.list(input)).find(
        (item) => item.id === selected.id && item.sha256 === selected.sha256,
      );
      if (!option) throw new ServiceError(404, "Timbrado selecionado indisponível.");
    }
    const asset = selected
      ? this.assets.find(
          (item) =>
            item.id === selected.id &&
            item.sha256.trim().toLowerCase() === selected.sha256 &&
            this.isAuthorized(item, input),
        )
      : this.findAsset(input);
    if (!asset) {
      if (selected) throw new ServiceError(404, "Timbrado selecionado indisponível.");
      this.onWarning(FALLBACK_WARNING);
      return { kind: "institutional", warning: FALLBACK_WARNING };
    }
    const bytes = await this.readAsset(asset);
    return {
      kind: asset.kind,
      bytes,
      sha256: asset.sha256.trim().toLowerCase(),
      warning: undefined,
    };
  }

  private async readAsset(asset: ReportLetterheadAsset): Promise<Buffer> {
    const bytes = asset.bytes ?? (asset.filePath ? await readFile(asset.filePath) : undefined);
    if (!bytes) throw new ServiceError(500, "Timbrado aprovado sem conteúdo.");
    const actualSha256 = createHash("sha256").update(bytes).digest("hex");
    if (actualSha256 !== asset.sha256.trim().toLowerCase()) {
      throw new ServiceError(500, "SHA-256 do timbrado inválido.");
    }
    return bytes;
  }

  private isSupportedImage(bytes: Buffer): boolean {
    if (bytes.length > 5 * 1024 * 1024) return false;
    const png =
      bytes.length >= 45 && bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"));
    const jpeg =
      bytes.length >= 4 &&
      bytes.subarray(0, 2).equals(Buffer.from("ffd8", "hex")) &&
      bytes.subarray(-2).equals(Buffer.from("ffd9", "hex"));
    if (!png && !jpeg) return false;
    if (png) {
      const chunks: Buffer[] = [];
      let cursor = 8;
      while (cursor + 12 <= bytes.length) {
        const length = bytes.readUInt32BE(cursor);
        if (cursor + length + 12 > bytes.length) return false;
        const name = bytes.toString("ascii", cursor + 4, cursor + 8);
        if (name === "IDAT") chunks.push(bytes.subarray(cursor + 8, cursor + 8 + length));
        cursor += length + 12;
        if (name === "IEND") break;
      }
      if (
        !chunks.length ||
        !inflateSync(Buffer.concat(chunks), { maxOutputLength: 40 * 1024 * 1024 }).length
      )
        return false;
    }
    const ImageDocument = PdfDocument as new (options: {
      autoFirstPage: boolean;
    }) => {
      openImage(source: ArrayBuffer): { width: number; height: number };
      end(): void;
    };
    const document = new ImageDocument({ autoFirstPage: false });
    try {
      const image = document.openImage(Uint8Array.from(bytes).buffer);
      return image.width > 0 && image.width <= 10_000 && image.height > 0 && image.height <= 10_000;
    } finally {
      document.end();
    }
  }

  private isAuthorized(asset: ReportLetterheadAsset, input: SelectReportLetterheadInput): boolean {
    return (
      asset.organizationId === input.organizationId &&
      (asset.kind === "organization" ||
        (input.scope === "shared" &&
          Boolean(input.departmentId) &&
          asset.departmentId === input.departmentId))
    );
  }

  private findAsset(input: SelectReportLetterheadInput): ReportLetterheadAsset | undefined {
    if (input.scope === "shared" && input.departmentId) {
      return this.assets.find(
        (asset) =>
          asset.kind === "department" &&
          asset.status !== "invalid" &&
          asset.organizationId === input.organizationId &&
          asset.departmentId === input.departmentId,
      );
    }

    if (input.scope === "personal") {
      return this.assets.find(
        (asset) => asset.kind === "organization" && asset.status !== "invalid" && asset.organizationId === input.organizationId,
      );
    }

    return undefined;
  }
}
