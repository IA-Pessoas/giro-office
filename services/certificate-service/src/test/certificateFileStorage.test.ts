import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildCertificateObjectPath,
  LocalCertificateFileStorage,
  SupabaseCertificateFileStorage,
} from "../services/certificateFileStorage.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
  tempDirs.length = 0;
});

describe("certificate file storage", () => {
  it("builds an organization scoped encrypted object path", () => {
    const pathValue = buildCertificateObjectPath({
      organizationId: "org-1",
      kind: "pj",
      certificateId: "cert-1",
      originalName: "Empresa Certificado.pfx",
      timestamp: 1_700_000_000_000,
    });

    expect(pathValue).toBe(
      "organizations/org-1/certificate-pj/cert-1/1700000000000_Empresa_Certificado.pfx.enc",
    );
  });

  it("writes, reads and deletes encrypted bytes locally", async () => {
    const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "certificate-storage-"));
    tempDirs.push(baseDir);
    const storage = new LocalCertificateFileStorage(baseDir);

    await storage.putObject({
      path: "organizations/org-1/certificate-pj/cert-1/file.pfx.enc",
      buffer: Buffer.from("encrypted"),
      contentType: "application/octet-stream",
    });

    await expect(
      storage.getObject("organizations/org-1/certificate-pj/cert-1/file.pfx.enc"),
    ).resolves.toEqual(Buffer.from("encrypted"));

    await storage.deleteObject("organizations/org-1/certificate-pj/cert-1/file.pfx.enc");
    await expect(
      storage.getObject("organizations/org-1/certificate-pj/cert-1/file.pfx.enc"),
    ).rejects.toThrow("Arquivo de certificado nao encontrado no storage.");
  });

  it("rejects local object paths outside the storage directory", async () => {
    const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "certificate-storage-"));
    tempDirs.push(baseDir);
    const storage = new LocalCertificateFileStorage(baseDir);

    await expect(
      storage.putObject({
        path: "../outside.pfx.enc",
        buffer: Buffer.from("encrypted"),
        contentType: "application/octet-stream",
      }),
    ).rejects.toThrow("Caminho de arquivo de certificado invalido.");
  });

  it("uses private Supabase storage without returning a public URL", async () => {
    const upload = vi.fn().mockResolvedValue({ error: null });
    const sourceBuffer = Buffer.from("encrypted");
    const download = vi.fn().mockResolvedValue({
      data: {
        arrayBuffer: async () =>
          sourceBuffer.buffer.slice(
            sourceBuffer.byteOffset,
            sourceBuffer.byteOffset + sourceBuffer.byteLength,
          ),
      },
      error: null,
    });
    const remove = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn().mockReturnValue({ upload, download, remove });
    const storage = new SupabaseCertificateFileStorage(
      { storage: { from } } as never,
      "Certificados",
    );

    await storage.putObject({
      path: "organizations/org-1/certificate-pj/cert-1/file.pfx.enc",
      buffer: Buffer.from("encrypted"),
      contentType: "application/octet-stream",
    });
    const downloaded = await storage.getObject(
      "organizations/org-1/certificate-pj/cert-1/file.pfx.enc",
    );
    await storage.deleteObject("organizations/org-1/certificate-pj/cert-1/file.pfx.enc");

    expect(from).toHaveBeenCalledWith("Certificados");
    expect(upload).toHaveBeenCalledWith(
      "organizations/org-1/certificate-pj/cert-1/file.pfx.enc",
      Buffer.from("encrypted"),
      { contentType: "application/octet-stream", upsert: true },
    );
    expect(downloaded.equals(Buffer.from("encrypted"))).toBe(true);
    expect(remove).toHaveBeenCalledWith(["organizations/org-1/certificate-pj/cert-1/file.pfx.enc"]);
  });
});
