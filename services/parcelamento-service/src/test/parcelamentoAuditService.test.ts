import "./envBootstrap.js";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { ParcelamentoAuditService } from "../services/parcelamentoAuditService.js";
import { organizationId, requestId, userId } from "./parcelamentoTestUtils.js";

const fixedNow = new Date("2026-07-15T10:00:00.000Z");

function createLoggerMock() {
  return {
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  };
}

function createService(
  overrides: Partial<ConstructorParameters<typeof ParcelamentoAuditService>[0]> = {},
) {
  return new ParcelamentoAuditService({
    enabled: true,
    serviceUrl: "http://audit-service.test/",
    serviceToken: "audit-token",
    logger: createLoggerMock(),
    clock: () => fixedNow,
    ...overrides,
  });
}

function lastAuditBody(): Record<string, unknown> {
  const fetchMock = vi.mocked(fetch);
  const body = fetchMock.mock.calls.at(-1)?.[1]?.body;

  return JSON.parse(String(body)) as Record<string, unknown>;
}

describe("ParcelamentoAuditService", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 201 })),
    );
  });

  it("sends ENTITY_CHANGE payload with parcelamento-service metadata", async () => {
    const service = createService({ requestIdFactory: () => "audit-event-1" });

    await service.recordChange({
      organizationId,
      userId,
      permission: "2",
      requestId,
      action: "Cadastro",
      referring: "parcelamento.installments",
      referringId: "installment-1",
      changes: { type: "Federal" },
    });

    expect(fetch).toHaveBeenCalledWith("http://audit-service.test/internal/audit/requests", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-service-token": "audit-token",
        "x-request-id": requestId,
      },
      body: expect.any(String),
      signal: expect.any(AbortSignal),
    });
    expect(lastAuditBody()).toMatchObject({
      requestId: "audit-event-1",
      organizationId,
      userId,
      permission: 2,
      method: "ENTITY_CHANGE",
      outcome: "success",
      serviceSource: "parcelamento-service",
      createdAt: fixedNow.toISOString(),
      finishedAt: fixedNow.toISOString(),
      metadata: {
        routeTarget: "parcelamento-service",
        requestId,
      },
      action: "Cadastro",
      referring: "parcelamento.installments",
      referringId: "installment-1",
      changes: { type: "Federal" },
    });
  });

  it("generates a unique audit request id and keeps the original request id as correlation", async () => {
    const nextAuditRequestId = vi
      .fn<() => string>()
      .mockReturnValueOnce("audit-event-1")
      .mockReturnValueOnce("audit-event-2");
    const service = createService({ requestIdFactory: nextAuditRequestId });

    await service.recordChange({
      organizationId,
      userId,
      permission: null,
      requestId,
      action: "Cadastro",
      referring: "parcelamento.installments",
      referringId: "installment-1",
      changes: {},
    });
    await service.recordChange({
      organizationId,
      userId,
      permission: null,
      requestId,
      action: "Cadastro",
      referring: "parcelamento.installments",
      referringId: "installment-2",
      changes: {},
    });

    const fetchMock = vi.mocked(fetch);
    const firstPayload = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      requestId: string;
      metadata: { requestId: string };
    };
    const secondPayload = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)) as {
      requestId: string;
      metadata: { requestId: string };
    };

    expect(firstPayload.requestId).toBe("audit-event-1");
    expect(secondPayload.requestId).toBe("audit-event-2");
    expect(firstPayload.metadata.requestId).toBe(requestId);
    expect(secondPayload.metadata.requestId).toBe(requestId);
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({ "x-request-id": requestId });
    expect(fetchMock.mock.calls[1]?.[1]?.headers).toMatchObject({ "x-request-id": requestId });
  });

  it("uses routeTarget parcelamento-service and department parcelamento", async () => {
    const service = createService();

    await service.recordChange({
      organizationId,
      userId,
      permission: null,
      requestId,
      action: "Atualizacao",
      referring: "parcelamento.panorama",
      referringId: "panorama-1",
      changes: { cnd_fgts: { from: false, to: true } },
    });

    expect(lastAuditBody()).toMatchObject({
      department: "parcelamento",
      metadata: {
        routeTarget: "parcelamento-service",
      },
      path: "/parcelamento/panorama",
    });
  });

  it("uses Cadastro action with create snapshot", async () => {
    const service = createService();
    const snapshot = { id: "installment-1", type: "Federal" };

    await service.recordChange({
      organizationId,
      userId,
      permission: null,
      requestId,
      action: "Cadastro",
      referring: "parcelamento.installments",
      referringId: "installment-1",
      changes: snapshot,
    });

    expect(lastAuditBody()).toMatchObject({
      action: "Cadastro",
      changes: snapshot,
    });
  });

  it("uses Atualizacao action with field diff", async () => {
    const service = createService();
    const diff = { status: { from: "Ativo", to: "Liquidado" } };

    await service.recordChange({
      organizationId,
      userId,
      permission: null,
      requestId,
      action: "Atualizacao",
      referring: "parcelamento.installments",
      referringId: "installment-1",
      changes: diff,
    });

    expect(lastAuditBody()).toMatchObject({
      action: "Atualizacao",
      changes: diff,
    });
  });

  it("does not throw when audit-service request fails", async () => {
    const logger = createLoggerMock();
    const err = new Error("network down");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(err)),
    );
    const service = createService({ logger });

    await expect(
      service.recordChange({
        organizationId,
        userId,
        permission: null,
        requestId,
        action: "Cadastro",
        referring: "parcelamento.installments",
        referringId: "installment-1",
        changes: {},
      }),
    ).resolves.toBeUndefined();
    await Promise.resolve();

    expect(logger.warn).toHaveBeenCalledWith(
      {
        err,
        referring: "parcelamento.installments",
        referringId: "installment-1",
      },
      "Falha ao registrar auditoria de parcelamento.",
    );
  });

  it("waits for audit-service response to settle", async () => {
    let resolveFetch: ((response: Response) => void) | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolveFetch = resolve;
          }),
      ),
    );
    const service = createService();

    const recordPromise = service.recordChange({
      organizationId,
      userId,
      permission: null,
      requestId,
      action: "Cadastro",
      referring: "parcelamento.installments",
      referringId: "installment-1",
      changes: {},
    });
    let settled = false;
    void recordPromise.then(() => {
      settled = true;
    });
    await Promise.resolve();

    expect(fetch).toHaveBeenCalled();
    expect(settled).toBe(false);

    resolveFetch?.(new Response(null, { status: 201 }));
    await recordPromise;

    expect(settled).toBe(true);
  });

  it("does not send when audit is disabled", async () => {
    const service = createService({ enabled: false });

    await service.recordChange({
      organizationId,
      userId,
      permission: null,
      requestId,
      action: "Cadastro",
      referring: "parcelamento.installments",
      referringId: "installment-1",
      changes: {},
    });

    expect(fetch).not.toHaveBeenCalled();
  });
});
