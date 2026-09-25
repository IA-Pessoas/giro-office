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
  it("lista só timbrados íntegros e autorizados, sem opções duplicadas", async () => {
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==",
      "base64",
    );
    const departmentPng = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYPj/HwADAgH/5ncLrgAAAABJRU5ErkJggg==",
      "base64",
    );
    const malformedPng = Buffer.from(
      "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000049454e44ae426082",
      "hex",
    );
    const service = new ReportLetterheadService([
      {
        id: "org-v1",
        label: "Organização",
        kind: "organization",
        organizationId,
        bytes: png,
        sha256: sha256(png),
      },
      {
        id: "org-copy",
        label: "Duplicado",
        kind: "organization",
        organizationId,
        bytes: png,
        sha256: sha256(png),
      },
      {
        id: "other",
        label: "Outra organização",
        kind: "organization",
        organizationId: "org-2",
        bytes: png,
        sha256: sha256(png),
      },
      {
        id: "bad",
        label: "Arquivo inválido",
        kind: "organization",
        organizationId,
        bytes: assetBytes("not-an-image"),
        sha256: sha256(assetBytes("not-an-image")),
      },
      {
        id: "malformed",
        label: "PNG incompleto",
        kind: "organization",
        organizationId,
        bytes: malformedPng,
        sha256: sha256(malformedPng),
      },
      {
        id: "department-v1",
        label: "Departamento",
        kind: "department",
        organizationId,
        departmentId,
        bytes: departmentPng,
        sha256: sha256(departmentPng),
      },
    ]);

    await expect(service.list({ organizationId, scope: "personal" })).resolves.toEqual([
      { id: "org-v1", label: "Organização", kind: "organization", sha256: sha256(png) },
    ]);
    await expect(service.list({ organizationId, departmentId, scope: "shared" })).resolves.toEqual([
      { id: "org-v1", label: "Organização", kind: "organization", sha256: sha256(png) },
      {
        id: "department-v1",
        label: "Departamento",
        kind: "department",
        sha256: sha256(departmentPng),
      },
    ]);
    await expect(
      service.select({
        organizationId,
        scope: "personal",
        selected: { id: "department-v1", sha256: sha256(departmentPng) },
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(
      service.select({
        organizationId,
        scope: "personal",
        selected: { id: "org-v1", sha256: sha256(png) },
      }),
    ).resolves.toMatchObject({ bytes: png, sha256: sha256(png) });
  });
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

  it("não escolhe automaticamente um timbrado reprovado", async () => {
    const onWarning = vi.fn();
    const bytes = assetBytes("legacy-letterhead");
    const service = new ReportLetterheadService(
      [
        {
          kind: "organization",
          organizationId,
          status: "invalid",
          bytes,
          sha256: sha256(bytes),
        },
      ],
      onWarning,
    );
    await expect(service.select({ organizationId, scope: "personal" })).resolves.toMatchObject({
      kind: "institutional",
    });
    expect(onWarning).toHaveBeenCalledOnce();
  });
});
