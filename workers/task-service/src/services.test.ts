import { describe, expect, it } from "vitest";
import {
  AI_EXTRACTION_UNAVAILABLE_CODE,
  AI_EXTRACTION_UNAVAILABLE_MESSAGE,
  createTaskServices,
} from "./services.js";
import { workerEnv } from "./test/env.js";

describe("extração de tarefas sem configuração", () => {
  it.each([
    { OPENAI_API_KEY: undefined },
    { AI_EXTRACTION_MODE: "invalido" },
  ])("responde 503 neutro, sem nome de variável (%o)", (overrides) => {
    const services = createTaskServices({}, workerEnv(overrides));
    expect(() => services.extraction()).toThrow(
      expect.objectContaining({
        statusCode: 503,
        code: AI_EXTRACTION_UNAVAILABLE_CODE,
        message: AI_EXTRACTION_UNAVAILABLE_MESSAGE,
      }),
    );
  });
});
