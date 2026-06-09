import "./envBootstrap.js";

import { once } from "node:events";
import { createServer, type IncomingMessage, type Server } from "node:http";

import { INTERNAL_SERVICE_TOKEN_HEADER } from "@workspace/shared";
import type { CreateAuditRequestPayload } from "@workspace/shared/audit";
import type { Logger } from "@workspace/shared/logger";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PessoalAuditService } from "../services/pessoalAuditService.js";

type CapturedAuditRequest = {
  method: string | undefined;
  url: string | undefined;
  headers: IncomingMessage["headers"];
  payload: CreateAuditRequestPayload;
};

const fixedNow = new Date("2026-06-03T10:00:00.000Z");
const createdServers: Server[] = [];

function createTestLogger(): Logger {
  return {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  } as unknown as Logger;
}

async function readRequestBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function startAuditIngestServer(statusCode = 201): Promise<{
  baseUrl: string;
  requests: CapturedAuditRequest[];
}> {
  const requests: CapturedAuditRequest[] = [];
  const server = createServer((request, response) => {
    void readRequestBody(request)
      .then((payload) => {
        requests.push({
          method: request.method,
          url: request.url,
          headers: request.headers,
          payload: payload as CreateAuditRequestPayload,
        });
        response.writeHead(statusCode, { "content-type": "application/json" });
        response.end(JSON.stringify({ success: statusCode >= 200 && statusCode < 300 }));
      })
      .catch(() => {
        response.writeHead(500);
        response.end();
      });
  });

  createdServers.push(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Nao foi possivel resolver a porta do servidor de teste.");
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    requests,
  };
}

afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();

  while (createdServers.length > 0) {
    const server = createdServers.pop();
    if (!server) {
      continue;
    }

    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }
});

describe("PessoalAuditService", () => {
  it("envia evento ENTITY_CHANGE para o audit-service interno", async () => {
    const logger = createTestLogger();
    const { baseUrl, requests } = await startAuditIngestServer();
    const service = new PessoalAuditService({
      enabled: true,
      serviceUrl: baseUrl,
      serviceToken: "audit-service-token",
      logger,
      now: () => fixedNow,
      requestIdFactory: () => "generated-request-id",
    });

    await service.recordChange({
      organizationId: "org-1",
      userId: "user-1",
      permission: 2,
      requestId: "req-from-route",
      action: "Atualizacao",
      referring: "pessoal.payroll",
      referringId: "payroll-1",
      path: "/pessoal/payroll/payroll-1",
      changes: {
        employees: { from: 10, to: 12 },
      },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      method: "POST",
      url: "/internal/audit/requests",
    });
    expect(requests[0]?.headers[INTERNAL_SERVICE_TOKEN_HEADER]).toBe("audit-service-token");
    expect(requests[0]?.payload).toEqual({
      requestId: "req-from-route",
      organizationId: "org-1",
      userId: "user-1",
      permission: 2,
      method: "ENTITY_CHANGE",
      path: "/pessoal/payroll/payroll-1",
      query: {},
      statusCode: 200,
      outcome: "success",
      durationMs: 0,
      serviceSource: "pessoal-service",
      createdAt: fixedNow.toISOString(),
      finishedAt: fixedNow.toISOString(),
      metadata: {
        routeTarget: "pessoal-service",
      },
      action: "Atualizacao",
      referring: "pessoal.payroll",
      referringId: "payroll-1",
      changes: {
        employees: { from: 10, to: 12 },
      },
      department: "pessoal",
    });
  });

  it("gera requestId quando a rota nao fornece um", async () => {
    const { baseUrl, requests } = await startAuditIngestServer();
    const service = new PessoalAuditService({
      enabled: true,
      serviceUrl: baseUrl,
      serviceToken: "audit-service-token",
      logger: createTestLogger(),
      now: () => fixedNow,
      requestIdFactory: () => "generated-request-id",
    });

    await service.recordChange({
      organizationId: "org-1",
      userId: "user-1",
      action: "Cadastro",
      referring: "pessoal.union",
      referringId: "union-1",
      changes: {},
    });

    expect(requests[0]?.payload.requestId).toBe("generated-request-id");
    expect(requests[0]?.payload.path).toBe("/pessoal/union");
  });

  it("redige todos os campos sensiveis sem preservar propriedades extras", async () => {
    const { baseUrl, requests } = await startAuditIngestServer();
    const service = new PessoalAuditService({
      enabled: true,
      serviceUrl: baseUrl,
      serviceToken: "audit-service-token",
      logger: createTestLogger(),
      now: () => fixedNow,
      requestIdFactory: () => "generated-request-id",
    });

    await service.recordChange({
      organizationId: "org-1",
      userId: "user-1",
      action: "Atualizacao",
      referring: "pessoal.passwords",
      referringId: "password-1",
      changes: {
        login_main: { from: "old-login", to: "new-login", raw: "still-secret" },
        senha_main: { previous: "old-password", next: "new-password" },
        login_secondary: { from: "old-secondary", to: "new-secondary" },
        senha_secondary: "raw-password",
        service_name: { from: "Gov", to: "Gov BR" },
      },
    });

    expect(requests[0]?.payload.changes).toEqual({
      login_main: { from: "[redacted]", to: "[redacted]" },
      senha_main: "[redacted]",
      login_secondary: { from: "[redacted]", to: "[redacted]" },
      senha_secondary: "[redacted]",
      service_name: { from: "Gov", to: "Gov BR" },
    });
  });

  it("redige changes em string para evitar vazamento de segredos serializados", async () => {
    const { baseUrl, requests } = await startAuditIngestServer();
    const service = new PessoalAuditService({
      enabled: true,
      serviceUrl: baseUrl,
      serviceToken: "audit-service-token",
      logger: createTestLogger(),
      now: () => fixedNow,
      requestIdFactory: () => "generated-request-id",
    });

    await service.recordChange({
      organizationId: "org-1",
      userId: "user-1",
      action: "Atualizacao",
      referring: "pessoal.passwords",
      referringId: "password-1",
      changes: '{"senha_main":"raw-password"}',
    });

    expect(requests[0]?.payload.changes).toEqual({
      value: "[redacted]",
    });
  });

  it("preserva routeTarget do pessoal-service quando metadata tenta sobrescrever", async () => {
    const { baseUrl, requests } = await startAuditIngestServer();
    const service = new PessoalAuditService({
      enabled: true,
      serviceUrl: baseUrl,
      serviceToken: "audit-service-token",
      logger: createTestLogger(),
      now: () => fixedNow,
      requestIdFactory: () => "generated-request-id",
    });

    await service.recordChange({
      organizationId: "org-1",
      userId: "user-1",
      action: "Cadastro",
      referring: "pessoal.union",
      referringId: "union-1",
      changes: {},
      metadata: {
        routeTarget: "legacy-service",
        source: "test",
      },
    });

    expect(requests[0]?.payload.metadata).toEqual({
      routeTarget: "pessoal-service",
      source: "test",
    });
  });

  it("registra log e resolve quando o audit-service retorna erro HTTP", async () => {
    const logger = createTestLogger();
    const { baseUrl } = await startAuditIngestServer(503);
    const service = new PessoalAuditService({
      enabled: true,
      serviceUrl: baseUrl,
      serviceToken: "audit-service-token",
      logger,
      now: () => fixedNow,
      requestIdFactory: () => "generated-request-id",
    });

    await expect(
      service.recordChange({
        organizationId: "org-1",
        userId: "user-1",
        action: "Cadastro",
        referring: "pessoal.union",
        referringId: "union-1",
        changes: {},
      }),
    ).resolves.toBeUndefined();

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "audit.ingest.failed",
        http: { statusCode: 503 },
      }),
    );
  });

  it("registra log e resolve quando fetch falha", async () => {
    const logger = createTestLogger();
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("network down"));
    const service = new PessoalAuditService({
      enabled: true,
      serviceUrl: "http://audit-service.test",
      serviceToken: "audit-service-token",
      logger,
      now: () => fixedNow,
      requestIdFactory: () => "generated-request-id",
    });

    await expect(
      service.recordChange({
        organizationId: "org-1",
        userId: "user-1",
        action: "Cadastro",
        referring: "pessoal.union",
        referringId: "union-1",
        changes: {},
      }),
    ).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "audit.ingest.failed",
        request: { id: "generated-request-id" },
      }),
    );
  });

  it("aborta a chamada de auditoria quando ultrapassa o timeout configurado", async () => {
    vi.useFakeTimers();
    const logger = createTestLogger();
    vi.spyOn(globalThis, "fetch").mockImplementationOnce((_input, init) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("aborted", "AbortError"));
        });
      });
    });
    const service = new PessoalAuditService({
      enabled: true,
      serviceUrl: "http://audit-service.test",
      serviceToken: "audit-service-token",
      logger,
      timeoutMs: 25,
      now: () => fixedNow,
      requestIdFactory: () => "generated-request-id",
    });

    const recordPromise = service.recordChange({
      organizationId: "org-1",
      userId: "user-1",
      action: "Cadastro",
      referring: "pessoal.union",
      referringId: "union-1",
      changes: {},
    });

    await vi.advanceTimersByTimeAsync(25);

    await expect(recordPromise).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "audit.ingest.failed",
        request: { id: "generated-request-id" },
      }),
    );
  });
});
