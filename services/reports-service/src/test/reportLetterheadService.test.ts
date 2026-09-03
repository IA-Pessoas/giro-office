import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { ReportLetterheadService } from "../services/reportLetterheadService.js";

const organizationId = "org-1";
const departmentId = "department-1";

function assetBytes(value: string): Buffer {
  return Buffer.from(value, "utf8");
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

describe("ReportLetterheadService", () => {
  it("seleciona o timbrado organizacional para relatório pessoal e valida o hash", async () => {
    const bytes = assetBytes("organization-letterhead");
    const service = new ReportLetterheadService([
      {
        kind: "organization",
        organizationId,
        bytes,
        sha256: sha256(bytes),
      },
    ]);

    await expect(
      service.select({ organizationId, departmentId, scope: "personal" }),
    ).resolves.toEqual({
      kind: "organization",
      bytes,
      sha256: sha256(bytes),
      warning: undefined,
    });
  });

  it("prioriza o timbrado departamental para relatório compartilhado", async () => {
    const organizationBytes = assetBytes("organization-letterhead");
    const departmentBytes = assetBytes("department-letterhead");
    const service = new ReportLetterheadService([
      {
        kind: "organization",
        organizationId,
        bytes: organizationBytes,
        sha256: sha256(organizationBytes),
      },
      {
        kind: "department",
        organizationId,
        departmentId,
        bytes: departmentBytes,
        sha256: sha256(departmentBytes),
      },
    ]);

    await expect(
      service.select({ organizationId, departmentId, scope: "shared" }),
    ).resolves.toMatchObject({ kind: "department", bytes: departmentBytes });
  });

  it("rejeita um timbrado cujo SHA-256 não corresponde ao conteúdo", async () => {
    const bytes = assetBytes("tampered-letterhead");
    const service = new ReportLetterheadService([
      {
        kind: "organization",
        organizationId,
        bytes,
        sha256: sha256(assetBytes("original-letterhead")),
      },
    ]);

    await expect(service.select({ organizationId, scope: "personal" })).rejects.toThrow(
      "SHA-256 do timbrado inválido.",
    );
  });

  it("usa fallback institucional reproduzível e emite aviso quando não há ativo", async () => {
    const onWarning = vi.fn();
    const service = new ReportLetterheadService([], onWarning);

    const first = await service.select({ organizationId, scope: "shared", departmentId });
    const second = await service.select({ organizationId, scope: "shared", departmentId });

    expect(first).toEqual({
      kind: "institutional",
      bytes: undefined,
      sha256: undefined,
      warning: "Timbrado aprovado ausente; usando fallback institucional.",
    });
    expect(second).toEqual(first);
    expect(onWarning).toHaveBeenCalledWith(first.warning);
  });
});
