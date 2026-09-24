import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "../generated/prisma/client.js";
import { RegularizeReconciliationService } from "../services/regularizeReconciliationService.js";
import { createTestApp, gatewayHeaders } from "./regularizeTestUtils.js";

describe("regularize license routes", () => {
  it("cria licença, armazena protocolo e expõe metadados no detalhe", async () => {
    vi.spyOn(RegularizeReconciliationService.prototype, "handleLicenseChanged").mockResolvedValue(
      undefined,
    );
    const licenseId = "b0000000-0000-4000-8000-000000000001";
    const organizationId = "a0000000-0000-4000-8000-000000000001";
    const objectPath = `regularize/organizations/${organizationId}/licenses/${licenseId}/protocols/10000000-0000-4000-8000-000000000001.pdf`;
    const licenseRecord: Record<string, unknown> = {
      id: licenseId,
      client_id: "d0000000-0000-4000-8000-000000000001",
      protocol_file_path: null,
      protocol_file_original_name: null,
      protocol_file_mime_type: null,
      protocol_file_size_bytes: null,
      protocol_file_uploaded_at: null,
    };
    const transaction = {
      license: {
        updateMany: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          Object.assign(licenseRecord, data);
          return { count: 1 };
        }),
      },
      logs: { create: vi.fn(async () => ({})) },
    };
    const prisma = {
      client: { findFirst: vi.fn(async () => ({ id: licenseRecord.client_id })) },
      user: { findFirst: vi.fn(async () => null) },
      license: {
        findFirst: vi.fn(async ({ select }: { select: Record<string, unknown> }) => {
          if ("client" in select) {
            return licenseRecord;
          }
          if ("protocol_file_path" in select) {
            return { id: licenseId, protocol_file_path: licenseRecord.protocol_file_path };
          }
          return null;
        }),
        create: vi.fn(async () => licenseRecord),
      },
      logs: { create: vi.fn(async () => ({})) },
      $transaction: vi.fn(async (operation: (tx: typeof transaction) => Promise<void>) =>
        operation(transaction),
      ),
    } as unknown as PrismaClient;
    const protocolStorage = {
      upload: vi.fn(async () => objectPath),
      deleteObject: vi.fn(async () => undefined),
      createSignedAccessUrl: vi.fn(async () => "https://storage.example/signed-protocol"),
    };
    const app = createTestApp(prisma, undefined, undefined, protocolStorage as never);

    const created = await request(app).post("/regularize/license").set(gatewayHeaders()).send({
      client_id: licenseRecord.client_id,
      has: true,
      type_license: "Alvara",
      entry_date: "2025-01-01",
      protocol: "PROTO-1",
      status: "Em Andamento",
      current_situation: "Regular",
      contact: "Contato",
      urgency: "Media",
      type: "Anual",
    });

    expect(created.status).toBe(201);
    expect(created.body.data.id).toBe(licenseId);

    const uploaded = await request(app)
      .post(`/regularize/license/${licenseId}/protocol`)
      .set(gatewayHeaders())
      .attach("file", Buffer.from("%PDF-1.7"), {
        filename: "protocolo.pdf",
        contentType: "application/pdf",
      });

    expect(uploaded.status).toBe(201);
    expect(protocolStorage.upload).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId,
        licenseId,
        file: expect.objectContaining({
          originalname: "protocolo.pdf",
          mimetype: "application/pdf",
          size: 8,
        }),
      }),
    );

    const detail = await request(app)
      .get("/regularize/license")
      .query({ id: licenseId })
      .set(gatewayHeaders());

    expect(detail.status).toBe(200);
    expect(detail.body.data.protocol_file).toMatchObject({
      original_name: "protocolo.pdf",
      mime_type: "application/pdf",
      size_bytes: 8,
    });

    const access = await request(app)
      .get(`/regularize/license/${licenseId}/protocol`)
      .set(gatewayHeaders({ permission: 1 }));

    expect(access.status).toBe(200);
    expect(access.body.data).toEqual({
      url: "https://storage.example/signed-protocol",
      expires_in_seconds: 300,
    });
    expect(JSON.stringify(access.body)).not.toContain(objectPath);
  });
});
