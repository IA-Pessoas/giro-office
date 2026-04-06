import {
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  INTERNAL_SERVICE_TOKEN_HEADER,
  ServiceError,
} from "@workspace/shared";
import { describe, expect, it, vi } from "vitest";

import { createHttpProjectProgressIntegration } from "./project-progress.js";

describe("project-progress integration", () => {
  it("chama POST /integracao-project-progress com headers e body esperados", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 }));
    const integration = createHttpProjectProgressIntegration({
      serviceUrl: "http://project-service.local",
      serviceToken: "internal-token",
      fetchImpl,
    });

    await integration.recalculateProjectProgress({
      projectId: "d0000000-0000-4000-8000-000000000001",
      userId: "c0000000-0000-4000-8000-000000000001",
      organizationId: "a0000000-0000-4000-8000-000000000001",
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [URL, RequestInit | undefined];

    expect(url.toString()).toBe("http://project-service.local/integracao-project-progress");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual({
      "content-type": "application/json",
      [INTERNAL_SERVICE_TOKEN_HEADER]: "internal-token",
      [FORWARDED_AUTH_USER_ID_HEADER]: "c0000000-0000-4000-8000-000000000001",
      [FORWARDED_AUTH_ORGANIZATION_ID_HEADER]: "a0000000-0000-4000-8000-000000000001",
    });
    expect(init?.body).toBe(
      JSON.stringify({ project_id: "d0000000-0000-4000-8000-000000000001" }),
    );
  });

  it("envolve resposta não-OK em ServiceError 502", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 500 }));
    const integration = createHttpProjectProgressIntegration({
      serviceUrl: "http://project-service.local",
      serviceToken: "internal-token",
      fetchImpl,
    });

    await expect(
      integration.recalculateProjectProgress({
        projectId: "d0000000-0000-4000-8000-000000000001",
        userId: "c0000000-0000-4000-8000-000000000001",
        organizationId: "a0000000-0000-4000-8000-000000000001",
      }),
    ).rejects.toBeInstanceOf(ServiceError);

    await expect(
      integration.recalculateProjectProgress({
        projectId: "d0000000-0000-4000-8000-000000000001",
        userId: "c0000000-0000-4000-8000-000000000001",
        organizationId: "a0000000-0000-4000-8000-000000000001",
      }),
    ).rejects.toMatchObject({ statusCode: 502 });
  });
});

