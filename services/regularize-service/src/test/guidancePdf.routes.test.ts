import "./envBootstrap.js";

import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "../generated/prisma/client.js";
import { createTestApp, gatewayHeaders } from "./regularizeTestUtils.js";

const guidanceId = "d0000000-0000-4000-8000-000000000001";

describe("GET /regularize/guidance/pdf", () => {
  it("returns the selected organization's guidance as a PDF", async () => {
    const findFirst = vi.fn(async () => ({
      id: guidanceId,
      organization_id: "a0000000-0000-4000-8000-000000000001",
      company_name: "Empresa Alfa Ltda",
      request: "CONSTITUIÇÃO",
      framework_obs: "Capital integralizado",
      target_snapshot: { name: "Empresa Alfa Ltda" },
      economic_activities: [],
      partners: [],
      branch_data: null,
      checklist_items: [],
    }));
    const prisma = { proceduralGuidance: { findFirst } } as unknown as PrismaClient;

    const response = await request(createTestApp(prisma))
      .get("/regularize/guidance/pdf")
      .query({ id: guidanceId })
      .set(gatewayHeaders())
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => callback(null, Buffer.concat(chunks)));
      });

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/^application\/pdf/);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.body.subarray(0, 5).toString()).toBe("%PDF-");
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: guidanceId, organization_id: "a0000000-0000-4000-8000-000000000001" },
      }),
    );
  });

  it("rejects an invalid id and an inaccessible guidance", async () => {
    const findFirst = vi.fn(async () => null);
    const prisma = { proceduralGuidance: { findFirst } } as unknown as PrismaClient;
    const app = createTestApp(prisma);

    const invalid = await request(app)
      .get("/regularize/guidance/pdf?id=invalid")
      .set(gatewayHeaders());
    const absent = await request(app)
      .get("/regularize/guidance/pdf")
      .query({ id: guidanceId })
      .set(gatewayHeaders());
    const unauthenticated = await request(app)
      .get("/regularize/guidance/pdf")
      .query({ id: guidanceId });

    expect(invalid.status).toBe(400);
    expect(absent.status).toBe(404);
    expect(absent.body.error).toContain("Orientação não encontrada");
    expect(unauthenticated.status).toBe(401);
    expect(findFirst).toHaveBeenCalledTimes(1);
  });

  it("explains when a guidance has no printable data", async () => {
    const prisma = {
      proceduralGuidance: {
        findFirst: vi.fn(async () => ({
          id: guidanceId,
          target_snapshot: {},
          economic_activities: [],
          partners: [],
          checklist_items: [],
        })),
      },
    } as unknown as PrismaClient;

    const response = await request(createTestApp(prisma))
      .get("/regularize/guidance/pdf")
      .query({ id: guidanceId })
      .set(gatewayHeaders());

    expect(response.status).toBe(422);
    expect(response.body.error).toContain("não possui dados suficientes");
  });

  it("rejects an excessively large guidance before rendering", async () => {
    const prisma = {
      proceduralGuidance: {
        findFirst: vi.fn(async () => ({
          id: guidanceId,
          company_name: "Alfa Ltda",
          request: "CONSTITUIÇÃO",
          comporate_purpose: "X".repeat(33_000),
          target_snapshot: {},
          economic_activities: [],
          partners: [],
          checklist_items: [],
        })),
      },
    } as unknown as PrismaClient;

    const response = await request(createTestApp(prisma))
      .get("/regularize/guidance/pdf")
      .query({ id: guidanceId })
      .set(gatewayHeaders());

    expect(response.status).toBe(422);
    expect(response.body.error).toContain("extensa demais");
  });
});
