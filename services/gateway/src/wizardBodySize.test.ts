import type { Request } from "express";
import { describe, expect, it } from "vitest";

import { assertWizardExtractionSize } from "./app.js";

const MAX_BYTES = 10 * 1024 * 1024 * 6 + 1024 * 1024;

function requestWithContentLength(value: string | undefined): Request {
  return {
    headers: value === undefined ? {} : { "content-length": value },
  } as unknown as Request;
}

describe("teto de tamanho da extração do wizard", () => {
  it("aceita corpo dentro do limite", () => {
    expect(assertWizardExtractionSize(requestWithContentLength(String(MAX_BYTES)))).toBeUndefined();
  });

  it("recusa com 413 um byte acima do limite", () => {
    const error = assertWizardExtractionSize(requestWithContentLength(String(MAX_BYTES + 1)));

    expect(error?.statusCode).toBe(413);
  });

  it("recusa com 411 quando o tamanho não é declarado", () => {
    // Sem parser e sem content-length, o tamanho só seria conhecido
    // depois de já ter recebido tudo — que é o que o teto existe para evitar.
    expect(assertWizardExtractionSize(requestWithContentLength(undefined))?.statusCode).toBe(411);
  });

  it("recusa com 411 um content-length não numérico", () => {
    expect(assertWizardExtractionSize(requestWithContentLength("abc"))?.statusCode).toBe(411);
  });
});
