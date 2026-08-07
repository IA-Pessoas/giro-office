import "./envBootstrap.js";

import type { IncomingMessage } from "node:http";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createCertificateFileCrypto } from "../services/certificateFileCrypto.js";
import {
  certificateGatewayHeaders,
  certificateGatewayHeadersWithoutPermission,
  certificateOrganizationId,
  certificateUserId,
  createCertificatePrismaMock,
  createCertificateTestApp,
} from "./testUtils.js";

const certificateId = "20000000-0000-4000-8000-000000000001";

function parseBinaryResponse(
  response: IncomingMessage,
  callback: (err: Error | null, body: Buffer) => void,
): void {
  const chunks: Buffer[] = [];

  response.on("data", (chunk: Buffer | string) => {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  });
  response.on("end", () => callback(null, Buffer.concat(chunks)));
  response.on("error", (err: Error) => callback(err, Buffer.alloc(0)));
}

describe("certificate PJ routes", () => {
  it("GET /certificate/pj/list requires bearer context", async () => {
    const app = createCertificateTestApp();

    const response = await request(app).get("/certificate/pj/list");

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      success: false,
      code: "UNAUTHORIZED",
    });
  });

  it("GET /certificate/pj/list requires certificate permission", async () => {
    const app = createCertificateTestApp();

    const response = await request(app)
      .get("/certificate/pj/list")
      .set(certificateGatewayHeadersWithoutPermission());

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      success: false,
      code: "FORBIDDEN",
    });
  });

  it("GET /certificate/pj/list returns list without password", async () => {
    const app = createCertificateTestApp();

    const response = await request(app)
      .get("/certificate/pj/list")
      .set(certificateGatewayHeaders(1));

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.items[0]).not.toHaveProperty("password");
    expect(response.body.data.items[0]).not.toHaveProperty("file_path");
  });

  it("GET /certificate/pj/:id returns password for permission certificado 2", async () => {
    const app = createCertificateTestApp();

    const response = await request(app)
      .get(`/certificate/pj/${certificateId}`)
      .set(certificateGatewayHeaders(2));

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.password).toBe("secret-password");
    expect(response.body.data).not.toHaveProperty("file_path");
  });

  it("GET /certificate/pj/:id returns password for permission certificado 3", async () => {
    const app = createCertificateTestApp();

    const response = await request(app)
      .get(`/certificate/pj/${certificateId}`)
      .set(certificateGatewayHeaders(3));

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.password).toBe("secret-password");
    expect(response.body.data).not.toHaveProperty("file_path");
  });

  it("GET /certificate/pj/:id allows Viewer without exposing private fields", async () => {
    const app = createCertificateTestApp();

    const response = await request(app)
      .get(`/certificate/pj/${certificateId}`)
      .set(certificateGatewayHeaders(1));

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: {
        id: certificateId,
        name: "Empresa Castelo",
        cnpj: "11222333000144",
      },
    });
    expect(response.body.data).not.toHaveProperty("password");
    expect(response.body.data).not.toHaveProperty("file_path");
    expect(response.body.data).not.toHaveProperty("file_encryption_iv");
    expect(response.body.data).not.toHaveProperty("file_encryption_tag");
  });

  it("blocks every certificate PJ write and file access for Viewer", async () => {
    const app = createCertificateTestApp(createCertificatePrismaMock());
    const viewerHeaders = certificateGatewayHeaders(1);

    const responses = await Promise.all([
      request(app).post("/certificate/pj").set(viewerHeaders),
      request(app).patch(`/certificate/pj/${certificateId}`).set(viewerHeaders),
      request(app).delete(`/certificate/pj/${certificateId}`).set(viewerHeaders),
      request(app).post(`/certificate/pj/${certificateId}/file`).set(viewerHeaders),
      request(app).get(`/certificate/pj/${certificateId}/file`).set(viewerHeaders),
      request(app).delete(`/certificate/pj/${certificateId}/file`).set(viewerHeaders),
    ]);

    expect(responses.map((response) => response.status)).toEqual([403, 403, 403, 403, 403, 403]);
    for (const response of responses) {
      expect(response.body).toMatchObject({
        success: false,
        code: "FORBIDDEN",
      });
    }
  });

  it("POST /certificate/pj rejects storage-managed metadata in JSON body", async () => {
    const app = createCertificateTestApp(createCertificatePrismaMock());

    const response = await request(app)
      .post("/certificate/pj")
      .set(certificateGatewayHeaders(2))
      .send({
        client_castelo_status: false,
        client_focus_status: false,
        name: "Empresa Castelo",
        cnpj: "11222333000144",
        responsible: "Maria Silva",
        model: "A1",
        legal_nature: "LTDA",
        password: "secret-password",
        expiration_date: "2026-12-31T00:00:00.000Z",
        was_paid: false,
        file_path: "https://public.example/cert.pfx",
        has_certificate: true,
      });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      success: false,
      code: "BAD_REQUEST",
    });
  });

  it("POST /certificate/pj preserves explicit string false booleans", async () => {
    const prisma = {
      certificatePJ: {
        findFirst: async () => null,
        create: async ({ data }: { data: Record<string, unknown> }) => ({
          id: "20000000-0000-4000-8000-000000000002",
          ...data,
        }),
      },
    };
    const app = createCertificateTestApp(prisma as never);

    const response = await request(app)
      .post("/certificate/pj")
      .set(certificateGatewayHeaders(2))
      .send({
        client_castelo_status: "false",
        client_focus_status: "false",
        name: "Empresa Castelo",
        cnpj: "11222333000144",
        responsible: "Maria Silva",
        model: "A1",
        legal_nature: "LTDA",
        password: "secret-password",
        expiration_date: "2026-12-31T00:00:00.000Z",
        was_paid: "false",
      });

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      client_castelo_status: false,
      client_focus_status: false,
      was_paid: false,
      organization_id: certificateOrganizationId,
    });
  });

  it("POST /certificate/pj rejects invalid boolean strings", async () => {
    const app = createCertificateTestApp(createCertificatePrismaMock());

    const response = await request(app)
      .post("/certificate/pj")
      .set(certificateGatewayHeaders(2))
      .send({
        client_castelo_status: "abc",
        client_focus_status: false,
        name: "Empresa Castelo",
        cnpj: "11222333000144",
        responsible: "Maria Silva",
        model: "A1",
        legal_nature: "LTDA",
        password: "secret-password",
        expiration_date: "2026-12-31T00:00:00.000Z",
        was_paid: false,
      });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      success: false,
      code: "BAD_REQUEST",
    });
  });

  it("POST /certificate/pj returns 403 without elevated permission", async () => {
    const app = createCertificateTestApp(createCertificatePrismaMock());

    const response = await request(app)
      .post("/certificate/pj")
      .set(certificateGatewayHeaders(1))
      .send({
        client_castelo_status: true,
        client_focus_status: false,
        name: "Empresa Castelo",
        cnpj: "11222333000144",
        responsible: "Maria Silva",
        model: "A1",
        legal_nature: "LTDA",
        password: "secret-password",
        expiration_date: "2026-12-31T00:00:00.000Z",
        was_paid: true,
      });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      success: false,
      code: "FORBIDDEN",
    });
  });

  it("PATCH /certificate/pj/:id returns 403 without elevated permission", async () => {
    const app = createCertificateTestApp(createCertificatePrismaMock());

    const response = await request(app)
      .patch(`/certificate/pj/${certificateId}`)
      .set(certificateGatewayHeaders(1))
      .send({ notes: "Atualizado" });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      success: false,
      code: "FORBIDDEN",
    });
  });

  it("PATCH /certificate/pj/:id rejects storage-managed metadata in JSON body", async () => {
    const app = createCertificateTestApp(createCertificatePrismaMock());

    const response = await request(app)
      .patch(`/certificate/pj/${certificateId}`)
      .set(certificateGatewayHeaders(2))
      .send({
        file_path: "organizations/org/certificate-pj/cert/file.pfx.enc",
        has_certificate: true,
      });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      success: false,
      code: "BAD_REQUEST",
    });
  });

  it("DELETE /certificate/pj/:id requires elevated certificate permission", async () => {
    const app = createCertificateTestApp();

    const response = await request(app)
      .delete(`/certificate/pj/${certificateId}`)
      .set(certificateGatewayHeaders(1));

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      success: false,
      code: "FORBIDDEN",
    });
  });

  it("DELETE /certificate/pj/:id rejects certificate users", async () => {
    const app = createCertificateTestApp();

    const response = await request(app)
      .delete(`/certificate/pj/${certificateId}`)
      .set(certificateGatewayHeaders(2));

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      success: false,
      code: "FORBIDDEN",
    });
  });

  it("DELETE /certificate/pj/:id removes the file before the record", async () => {
    const prisma = createCertificatePrismaMock();
    const fileStorage = {
      putObject: vi.fn(),
      getObject: vi.fn(),
      deleteObject: vi.fn(async () => undefined),
    };
    const app = createCertificateTestApp(prisma, { fileStorage });

    const response = await request(app)
      .delete(`/certificate/pj/${certificateId}`)
      .set(certificateGatewayHeaders(3));

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: { ok: true },
    });
    expect(fileStorage.deleteObject).toHaveBeenCalledWith("/certificates/pj/empresa.pfx");
    expect(prisma.certificatePJ.delete).toHaveBeenCalledWith({
      where: { id: certificateId, organization_id: certificateOrganizationId },
    });
  });

  it("POST /certificate/pj/:id/file rejects missing file", async () => {
    const app = createCertificateTestApp(createCertificatePrismaMock());

    const response = await request(app)
      .post(`/certificate/pj/${certificateId}/file`)
      .set(certificateGatewayHeaders(2));

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      success: false,
      code: "BAD_REQUEST",
    });
  });

  it("POST /certificate/pj/:id/file rejects unsupported certificate files", async () => {
    const app = createCertificateTestApp(createCertificatePrismaMock());

    const response = await request(app)
      .post(`/certificate/pj/${certificateId}/file`)
      .set(certificateGatewayHeaders(2))
      .attach("file", Buffer.from("not-a-certificate"), {
        filename: "certificate.txt",
        contentType: "application/octet-stream",
      });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      success: false,
      code: "BAD_REQUEST",
    });
  });

  it("POST /certificate/pj/:id/file rejects files above the configured limit", async () => {
    const app = createCertificateTestApp(createCertificatePrismaMock(), {
      envOverrides: { certificateFileMaxSizeBytes: 4 },
    });

    const response = await request(app)
      .post(`/certificate/pj/${certificateId}/file`)
      .set(certificateGatewayHeaders(2))
      .attach("file", Buffer.from("too-large"), {
        filename: "certificate.pfx",
        contentType: "application/x-pkcs12",
      });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      success: false,
      code: "BAD_REQUEST",
    });
  });

  it("POST /certificate/pj/:id/file rejects unexpected multipart fields", async () => {
    const app = createCertificateTestApp(createCertificatePrismaMock());

    const response = await request(app)
      .post(`/certificate/pj/${certificateId}/file`)
      .set(certificateGatewayHeaders(2))
      .field("unexpected", "value")
      .attach("file", Buffer.from("certificate-bytes"), {
        filename: "certificate.pfx",
        contentType: "application/x-pkcs12",
      });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      success: false,
      code: "BAD_REQUEST",
    });
  });

  it("POST /certificate/pj/:id/file requires elevated certificate permission", async () => {
    const app = createCertificateTestApp(createCertificatePrismaMock());

    const response = await request(app)
      .post(`/certificate/pj/${certificateId}/file`)
      .set(certificateGatewayHeaders(1))
      .attach("file", Buffer.from("certificate-bytes"), {
        filename: "certificate.pfx",
        contentType: "application/x-pkcs12",
      });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      success: false,
      code: "FORBIDDEN",
    });
  });

  it("POST /certificate/pj/:id/file stores encrypted metadata and returns metadata only", async () => {
    const prisma = createCertificatePrismaMock();
    const fileStorage = {
      putObject: vi.fn(async () => undefined),
      getObject: vi.fn(),
      deleteObject: vi.fn(),
    };
    const app = createCertificateTestApp(prisma, { fileStorage });

    const response = await request(app)
      .post(`/certificate/pj/${certificateId}/file`)
      .set(certificateGatewayHeaders(2))
      .attach("file", Buffer.from("certificate-bytes"), {
        filename: "Empresa Castelo.pfx",
        contentType: "application/x-pkcs12",
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toMatchObject({
      file_original_name: "Empresa Castelo.pfx",
      file_mime_type: "application/x-pkcs12",
      file_uploaded_by_user_id: certificateUserId,
    });
    expect(response.body.data).not.toHaveProperty("file_path");
    expect(response.body.data).not.toHaveProperty("file_sha256");
    expect(response.body.data).not.toHaveProperty("file_storage_provider");
    expect(response.body.data).not.toHaveProperty("file_storage_bucket");
    expect(response.body.data).not.toHaveProperty("file_encryption_iv");
    expect(response.body.data).not.toHaveProperty("file_encryption_tag");
    expect(fileStorage.putObject).toHaveBeenCalledWith(
      expect.objectContaining({
        path: expect.stringMatching(
          /^organizations\/10000000-0000-4000-8000-000000000001\/certificate-pj\/20000000-0000-4000-8000-000000000001\/\d+_Empresa_Castelo\.pfx\.enc$/,
        ),
        contentType: "application/octet-stream",
      }),
    );
  });

  it("GET /certificate/pj/:id/file requires elevated certificate permission", async () => {
    const app = createCertificateTestApp(createCertificatePrismaMock());

    const response = await request(app)
      .get(`/certificate/pj/${certificateId}/file`)
      .set(certificateGatewayHeaders(1));

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      success: false,
      code: "FORBIDDEN",
    });
  });

  it("GET /certificate/pj/:id/file returns original bytes and no-store cache header", async () => {
    const crypto = createCertificateFileCrypto({
      keyBase64: Buffer.alloc(32, 7).toString("base64"),
      keyVersion: "v1",
    });
    const originalBuffer = Buffer.from("certificate-bytes");
    const encrypted = crypto.encrypt(originalBuffer);
    const objectPath =
      "organizations/10000000-0000-4000-8000-000000000001/certificate-pj/20000000-0000-4000-8000-000000000001/file.pfx.enc";
    const prisma = createCertificatePrismaMock();
    vi.mocked(prisma.certificatePJ.findFirst).mockResolvedValueOnce({
      id: certificateId,
      organization_id: certificateOrganizationId,
      file_path: objectPath,
      file_original_name: "Empresa Castelo.pfx",
      file_mime_type: "application/x-pkcs12",
      file_size_bytes: originalBuffer.length,
      file_sha256: encrypted.sha256,
      file_encryption_iv: encrypted.ivBase64,
      file_encryption_tag: encrypted.authTagBase64,
      file_encryption_key_version: encrypted.keyVersion,
    } as never);
    const fileStorage = {
      putObject: vi.fn(),
      getObject: vi.fn(async () => encrypted.encryptedBuffer),
      deleteObject: vi.fn(),
    };
    const app = createCertificateTestApp(prisma, {
      fileCrypto: crypto,
      fileStorage,
    });

    const response = await request(app)
      .get(`/certificate/pj/${certificateId}/file`)
      .buffer(true)
      .parse(parseBinaryResponse)
      .set(certificateGatewayHeaders(2));

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("application/x-pkcs12");
    expect(response.headers["content-disposition"]).toBe(
      'attachment; filename="Empresa Castelo.pfx"',
    );
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body.equals(originalBuffer)).toBe(true);
  });

  it("GET /certificate/pj/:id/file returns 404 when the tenant has no file", async () => {
    const prisma = createCertificatePrismaMock();
    vi.mocked(prisma.certificatePJ.findFirst).mockResolvedValueOnce(null);
    const app = createCertificateTestApp(prisma);

    const response = await request(app)
      .get(`/certificate/pj/${certificateId}/file`)
      .set(certificateGatewayHeaders(2));

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      success: false,
      code: "NOT_FOUND",
    });
  });

  it("DELETE /certificate/pj/:id/file rejects module users", async () => {
    const app = createCertificateTestApp();

    const response = await request(app)
      .delete(`/certificate/pj/${certificateId}/file`)
      .set(certificateGatewayHeaders(2));

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      success: false,
      code: "FORBIDDEN",
    });
  });

  it("DELETE /certificate/pj/:id/file clears metadata and deletes the object", async () => {
    const objectPath =
      "organizations/10000000-0000-4000-8000-000000000001/certificate-pj/20000000-0000-4000-8000-000000000001/file.pfx.enc";
    const prisma = createCertificatePrismaMock();
    vi.mocked(prisma.certificatePJ.findFirst).mockResolvedValueOnce({
      id: certificateId,
      organization_id: certificateOrganizationId,
      file_path: objectPath,
      file_original_name: "Empresa Castelo.pfx",
      file_mime_type: "application/x-pkcs12",
      file_encryption_iv: "iv",
      file_encryption_tag: "tag",
    } as never);
    const fileStorage = {
      putObject: vi.fn(),
      getObject: vi.fn(),
      deleteObject: vi.fn(async () => undefined),
    };
    const app = createCertificateTestApp(prisma, { fileStorage });

    const response = await request(app)
      .delete(`/certificate/pj/${certificateId}/file`)
      .set(certificateGatewayHeaders(3));

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: { ok: true },
    });
    expect(prisma.certificatePJ.update).toHaveBeenCalledWith({
      where: { id: certificateId, organization_id: certificateOrganizationId },
      data: expect.objectContaining({
        file_path: null,
        file_original_name: null,
        has_certificate: false,
      }),
    });
    expect(fileStorage.deleteObject).toHaveBeenCalledWith(objectPath);
  });

  it("DELETE /certificate/pj/:id returns 500 and keeps the record when storage deletion fails", async () => {
    const objectPath =
      "organizations/10000000-0000-4000-8000-000000000001/certificate-pj/20000000-0000-4000-8000-000000000001/file.pfx.enc";
    const prisma = createCertificatePrismaMock();
    vi.mocked(prisma.certificatePJ.findFirst).mockResolvedValueOnce({
      id: certificateId,
      organization_id: certificateOrganizationId,
      file_path: objectPath,
    } as never);
    const fileStorage = {
      putObject: vi.fn(),
      getObject: vi.fn(),
      deleteObject: vi.fn(async () => {
        throw new Error("storage unavailable");
      }),
    };
    const app = createCertificateTestApp(prisma, { fileStorage });

    const response = await request(app)
      .delete(`/certificate/pj/${certificateId}`)
      .set(certificateGatewayHeaders(3));

    expect(response.status).toBe(500);
    expect(response.body).toMatchObject({
      success: false,
      code: "INTERNAL_ERROR",
    });
    expect(fileStorage.deleteObject).toHaveBeenCalledWith(objectPath);
    expect(prisma.certificatePJ.delete).not.toHaveBeenCalled();
  });

  it("DELETE /certificate/pj/:id returns 404 for a certificate outside the organization", async () => {
    const prisma = createCertificatePrismaMock();
    vi.mocked(prisma.certificatePJ.findFirst).mockResolvedValueOnce(null);
    const app = createCertificateTestApp(prisma);

    const response = await request(app)
      .delete(`/certificate/pj/${certificateId}`)
      .set(certificateGatewayHeaders(3));

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ success: false, code: "NOT_FOUND" });
    expect(prisma.certificatePJ.delete).not.toHaveBeenCalled();
  });
});
