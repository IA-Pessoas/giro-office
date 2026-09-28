import "./envBootstrap.js";

import { createHmac } from "node:crypto";

import {
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_PERMISSION_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  INTERNAL_SERVICE_TOKEN_HEADER,
  ServiceError,
} from "@workspace/shared";
import { createLogger } from "@workspace/shared/logger";
import { MemoryLogStream } from "@workspace/shared/testUtils";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createMarketingApp } from "../app.js";
import { getMarketingServiceEnv } from "../config/env.js";
import type { MarketingEventsProvider } from "../routes/marketingEvents.routes.js";

const organizationId = "10000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000001";
const eventId = "20000000-0000-4000-8000-000000000001";
const event = {
  id: eventId,
  name: "Workshop",
  logo: "",
  status: "Novo",
  priority: "Média",
  objective: "Integração",
  audience: "Equipe",
};

function createTestLogger() {
  return createLogger({
    service: "marketing-service-test",
    env: "test",
    level: "silent",
    destination: new MemoryLogStream(),
  });
}

function gatewayHeaders(permission = 1): Record<string, string> {
  return {
    [INTERNAL_SERVICE_TOKEN_HEADER]: "marketing-service-internal-token-test",
    [FORWARDED_AUTH_USER_ID_HEADER]: userId,
    [FORWARDED_AUTH_ORGANIZATION_ID_HEADER]: organizationId,
    [FORWARDED_AUTH_PERMISSION_HEADER]: String(permission),
  };
}

function createTestApp(eventsService: MarketingEventsProvider) {
  return createMarketingApp({
    env: getMarketingServiceEnv(),
    logger: createTestLogger(),
    eventsService,
  });
}

function createEventsService() {
  return {
    listEvents: vi.fn(async () => [event]),
    createEvent: vi.fn(async () => event),
    updateEvent: vi.fn(async () => null),
  };
}

function createJwt(claims: Record<string, unknown>): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = `${encode({ alg: "HS256", typ: "JWT" })}.${encode(claims)}`;
  const signature = createHmac("sha256", "marketing-service-jwt-secret-test")
    .update(unsigned)
    .digest("base64url");
  return `${unsigned}.${signature}`;
}

describe("Marketing events routes", () => {
  it("lists events within the authenticated organization", async () => {
    const service = createEventsService();
    const response = await request(createTestApp(service))
      .get("/marketing/events/list")
      .set(gatewayHeaders());

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: [event] });
    expect(service.listEvents).toHaveBeenCalledWith(organizationId);
  });

  it("does not use global permission for direct JWT access without Marketing permission", async () => {
    const service = createEventsService();
    const response = await request(createTestApp(service))
      .get("/marketing/events/list")
      .set(
        "Authorization",
        `Bearer ${createJwt({
          user_id: userId,
          organization_id: organizationId,
          permission: 3,
        })}`,
      );

    expect(response.status).toBe(403);
    expect(service.listEvents).not.toHaveBeenCalled();
  });

  it("accepts direct JWT access when it grants Marketing permission", async () => {
    const service = createEventsService();
    const response = await request(createTestApp(service))
      .get("/marketing/events/list")
      .set(
        "Authorization",
        `Bearer ${createJwt({
          user_id: userId,
          organization_id: organizationId,
          permission: 0,
          modules: { marketing: 1 },
        })}`,
      );

    expect(response.status).toBe(200);
    expect(service.listEvents).toHaveBeenCalledWith(organizationId);
  });

  it("requires edit permission to create events", async () => {
    const service = createEventsService();
    const response = await request(createTestApp(service))
      .post("/marketing/events")
      .set(gatewayHeaders(1))
      .send({ name: "Workshop" });

    expect(response.status).toBe(403);
    expect(service.createEvent).not.toHaveBeenCalled();
  });

  it("creates events for the authenticated organization", async () => {
    const service = createEventsService();
    const response = await request(createTestApp(service))
      .post("/marketing/events")
      .set(gatewayHeaders(2))
      .send({ name: "Workshop", priority: "Média" });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ success: true, data: event });
    expect(service.createEvent).toHaveBeenCalledWith(organizationId, {
      name: "Workshop",
      logo: "",
      status: "Novo",
      priority: "Média",
      objective: "",
      audience: "",
    });
  });

  it("accepts only priority values supported by the legacy form", async () => {
    const service = createEventsService();
    const response = await request(createTestApp(service))
      .post("/marketing/events")
      .set(gatewayHeaders(2))
      .send({ name: "Workshop", priority: "Crítica" });

    expect(response.status).toBe(400);
    expect(service.createEvent).not.toHaveBeenCalled();
  });

  it("returns a conflict when the organization already has the event name", async () => {
    const service = createEventsService();
    service.createEvent.mockRejectedValue(
      new ServiceError(409, "Já existe um evento com esse nome nesta organização."),
    );
    const response = await request(createTestApp(service))
      .post("/marketing/events")
      .set(gatewayHeaders(2))
      .send({ name: "Workshop", priority: "Média" });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe("Já existe um evento com esse nome nesta organização.");
  });

  it("rejects an empty event name before writing", async () => {
    const service = createEventsService();
    const response = await request(createTestApp(service))
      .post("/marketing/events")
      .set(gatewayHeaders(2))
      .send({ name: "   " });

    expect(response.status).toBe(400);
    expect(service.createEvent).not.toHaveBeenCalled();
  });
  it("does not update an event outside the authenticated organization", async () => {
    const service = createEventsService();
    const response = await request(createTestApp(service))
      .put(`/marketing/events/${eventId}`)
      .set(gatewayHeaders(2))
      .send({ name: "Workshop atualizado" });

    expect(response.status).toBe(404);
    expect(service.updateEvent).toHaveBeenCalledWith(organizationId, eventId, {
      name: "Workshop atualizado",
    });
  });
});
