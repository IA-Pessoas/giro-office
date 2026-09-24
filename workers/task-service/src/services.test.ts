import { describe, expect, it } from "vitest";
import { createTaskServices } from "./services.js";
import { workerEnv } from "./test/env.js";

describe("extração de tarefas sem configuração", () => {
  it.each([
    { OPENAI_API_KEY: undefined },
    { AI_EXTRACTION_MODE: "invalido" },
  ])("responde 503 neutro, sem nome de variável (%o)", (overrides) => {
    const services = createTaskServices({}, workerEnv(overrides));
    let error: unknown;
    try {
      services.extraction();
    } catch (caught) {
      error = caught;
    }
    expect(error).toMatchObject({
      statusCode: 503,
      message: "Extração por IA indisponível no momento.",
    });
  });
});
