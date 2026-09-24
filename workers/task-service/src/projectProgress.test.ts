import { describe, expect, it } from "vitest";
import { createProjectProgressIntegration } from "./projectProgress.js";
import { recordingBinding, TOKENS, workerEnv } from "./test/env.js";

describe("createProjectProgressIntegration", () => {
  it("recalcula o progresso pelo PROJECT_SERVICE com o token interno", async () => {
    const project = recordingBinding();
    await createProjectProgressIntegration(
      workerEnv({ PROJECT_SERVICE: project }),
    ).recalculateProjectProgress({ projectId: "p-1", userId: "u-1", organizationId: "o-1" });

    const [request] = project.calls;
    expect(new URL(request.url).pathname).toBe("/project/progress");
    // O Node enviava o AUDIT_SERVICE_TOKEN; o project Worker valida o INTERNAL_SERVICE_TOKEN.
    expect(request.headers.get("x-internal-service-token")).toBe(TOKENS.internal);
    expect(request.headers.get("x-auth-user-id")).toBe("u-1");
    expect(await request.json()).toEqual({ project_id: "p-1" });
  });

  it("responde 502 sem o binding do project-service", async () => {
    await expect(
      createProjectProgressIntegration(workerEnv()).recalculateProjectProgress({
        projectId: "p",
        userId: "u",
        organizationId: "o",
      }),
    ).rejects.toMatchObject({ statusCode: 502 });
  });
});
