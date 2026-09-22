import { describe, expect, it } from "vitest";
import { runInTaskContext } from "../context.js";
import { recordingBinding, TOKENS, workerEnv } from "../test/env.js";
import { createHttpProjectProgressIntegration } from "./projectProgress.js";

const inContext = <T>(env: ReturnType<typeof workerEnv>, fn: () => Promise<T>) =>
  runInTaskContext({ env, createPrisma: () => ({ $disconnect: async () => {} }) }, fn);

describe("integração de progresso com o project-service", () => {
  it("recalcula o progresso pelo PROJECT_SERVICE com o token interno", async () => {
    const project = recordingBinding();
    // Criada fora da requisição, como no construtor do TaskWorkflowService.
    const integration = createHttpProjectProgressIntegration();

    await inContext(workerEnv({ PROJECT_SERVICE: project }), () =>
      integration.recalculateProjectProgress({
        projectId: "p-1",
        userId: "u-1",
        organizationId: "o-1",
      }),
    );

    const [request] = project.calls;
    expect(new URL(request.url).pathname).toBe("/project/progress");
    expect(request.headers.get("x-internal-service-token")).toBe(TOKENS.internal);
    expect(await request.json()).toEqual({ project_id: "p-1" });
  });

  it("responde 502 sem o binding do project-service", async () => {
    const integration = createHttpProjectProgressIntegration();
    await expect(
      inContext(workerEnv(), () =>
        integration.recalculateProjectProgress({
          projectId: "p",
          userId: "u",
          organizationId: "o",
        }),
      ),
    ).rejects.toMatchObject({ statusCode: 502 });
  });
});
