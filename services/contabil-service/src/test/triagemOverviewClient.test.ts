import "./envBootstrap.js";

import {
  FORWARDED_AUTH_MODULES_HEADER,
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_PERMISSION_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  INTERNAL_SERVICE_TOKEN_HEADER,
  REQUEST_ID_HEADER,
  TRIAGE_ACCOUNTING_STATUS_PRECEDENCE,
  TRIAGE_ACCOUNTING_SUMMARY_VERSION,
} from "@workspace/shared";
import { describe, expect, it, vi } from "vitest";

import { TriagemOverviewClient } from "../integrations/triagemOverviewClient.js";

const ORGANIZATION_ID = "a0000000-0000-4000-8000-000000000001";
const USER_ID = "c0000000-0000-4000-8000-000000000001";
const CLIENT_ID = "b0000000-0000-4000-8000-000000000001";
const COMPETENCE = "2026-09";

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function overviewResponse(status: string, clientId = CLIENT_ID, competence = COMPETENCE) {
  return response({
    success: true,
    data: {
      items: [{ client_id: clientId, legal_name: "Cliente Teste", competence, status }],
      total: 1,
      page: 1,
      page_size: 1,
      indicators: {
        urgent_open: status === "URGENT_OPEN" ? 1 : 0,
        routine_pending: status === "ROUTINE_PENDING" ? 1 : 0,
        bank_pending: status === "BANK_PENDING" ? 1 : 0,
        complete: status === "COMPLETE" ? 1 : 0,
      },
    },
  });
}

function createClient(fetchImpl: typeof fetch) {
  return new TriagemOverviewClient({
    baseUrl: "http://triagem.internal:3046/",
    serviceToken: "triagem-internal-token",
    timeoutMs: 50,
    fetchImpl,
  });
}

describe("TriagemOverviewClient", () => {
  it("consulta uma competência da organização com autenticação interna e retorna DTO versionável", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(overviewResponse("ROUTINE_PENDING"));

    const result = await createClient(fetchImpl).getSummary({
      organizationId: ORGANIZATION_ID,
      userId: USER_ID,
      permission: 2,
      modules: { contabil: 2, triagem: 0 },
      clientId: CLIENT_ID,
      competence: COMPETENCE,
      requestId: "request-1156",
    });

    expect(result).toEqual({
      version: TRIAGE_ACCOUNTING_SUMMARY_VERSION,
      organization_id: ORGANIZATION_ID,
      client_id: CLIENT_ID,
      legal_name: "Cliente Teste",
      competence: COMPETENCE,
      status: "ROUTINE_PENDING",
    });
    expect(fetchImpl).toHaveBeenCalledOnce();

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "http://triagem.internal:3046/triagem/overview?client_id=" +
        `${CLIENT_ID}&competence=${COMPETENCE}&page=1&page_size=1`,
    );
    expect(init.method).toBe("GET");
    expect(init.headers).toEqual({
      "content-type": "application/json",
      [INTERNAL_SERVICE_TOKEN_HEADER]: "triagem-internal-token",
      [FORWARDED_AUTH_USER_ID_HEADER]: USER_ID,
      [FORWARDED_AUTH_ORGANIZATION_ID_HEADER]: ORGANIZATION_ID,
      [FORWARDED_AUTH_PERMISSION_HEADER]: "2",
      [FORWARDED_AUTH_MODULES_HEADER]: JSON.stringify({ contabil: 2, triagem: 0 }),
      [REQUEST_ID_HEADER]: "request-1156",
    });
  });

  it.each(
    TRIAGE_ACCOUNTING_STATUS_PRECEDENCE,
  )("preserva o status canônico %s da precedência da Triagem", async (status) => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(overviewResponse(status));

    await expect(
      createClient(fetchImpl).getSummary({
        organizationId: ORGANIZATION_ID,
        userId: USER_ID,
        clientId: CLIENT_ID,
        competence: COMPETENCE,
      }),
    ).resolves.toMatchObject({ version: TRIAGE_ACCOUNTING_SUMMARY_VERSION, status });
  });

  it("preserva o fallback de permissão quando não há módulos encaminhados", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(overviewResponse("COMPLETE"));

    await createClient(fetchImpl).getSummary({
      organizationId: ORGANIZATION_ID,
      userId: USER_ID,
      permission: 1,
      clientId: CLIENT_ID,
      competence: COMPETENCE,
    });

    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(init.headers).not.toHaveProperty(FORWARDED_AUTH_MODULES_HEADER);
  });

  it("rejeita resposta de outra organização lógica ou competência", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(overviewResponse("COMPLETE", CLIENT_ID, "2026-08"));

    await expect(
      createClient(fetchImpl).getSummary({
        organizationId: ORGANIZATION_ID,
        userId: USER_ID,
        clientId: CLIENT_ID,
        competence: COMPETENCE,
      }),
    ).rejects.toMatchObject({ statusCode: 502 });
  });

  it("trata overview vazio (cliente sem competência na Triagem) como 404 (#1322)", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      response({
        success: true,
        data: {
          items: [],
          total: 0,
          page: 1,
          page_size: 1,
          indicators: { urgent_open: 0, routine_pending: 0, bank_pending: 0, complete: 0 },
        },
      }),
    );

    await expect(
      createClient(fetchImpl).getSummary({
        organizationId: ORGANIZATION_ID,
        userId: USER_ID,
        clientId: CLIENT_ID,
        competence: COMPETENCE,
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("mapeia HTTP não bem-sucedido para indisponibilidade explícita", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response({}, 503));

    await expect(
      createClient(fetchImpl).getSummary({
        organizationId: ORGANIZATION_ID,
        userId: USER_ID,
        clientId: CLIENT_ID,
        competence: COMPETENCE,
      }),
    ).rejects.toMatchObject({ statusCode: 503 });
  });

  it("mapeia abort/timeout para gateway timeout", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new DOMException("aborted", "AbortError"));

    await expect(
      createClient(fetchImpl).getSummary({
        organizationId: ORGANIZATION_ID,
        userId: USER_ID,
        clientId: CLIENT_ID,
        competence: COMPETENCE,
      }),
    ).rejects.toMatchObject({ statusCode: 504 });
  });

  it("valida o escopo antes de fazer a chamada", async () => {
    const fetchImpl = vi.fn<typeof fetch>();

    await expect(
      createClient(fetchImpl).getSummary({
        organizationId: ORGANIZATION_ID,
        userId: USER_ID,
        clientId: CLIENT_ID,
        competence: "2026-13",
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
