import { parseWithZod, ServiceError } from "@workspace/shared";
import { describe, expect, it } from "vitest";

import { taskListQuerySchema } from "../schemas/taskList.schemas.js";

describe("task list query schema", () => {
  it("coage pagina e limite validos", () => {
    expect(parseWithZod(taskListQuerySchema, { page: "2", limit: "20" })).toMatchObject({
      page: 2,
      limit: 20,
    });
  });

  it("aceita filtros explícitos de cliente e atribuição", () => {
    expect(
      parseWithZod(taskListQuerySchema, {
        client_id: "11111111-1111-4111-8111-111111111111",
        assignment: "unassigned",
      }),
    ).toMatchObject({
      client_id: "11111111-1111-4111-8111-111111111111",
      assignment: "unassigned",
    });
  });

  it.each([
    { page: "0" },
    { limit: "101" },
    { page: "1.5" },
  ])("rejeita limites invalidos com 400: %o", (query) => {
    expect(() => parseWithZod(taskListQuerySchema, query)).toThrow(ServiceError);
  });

  it.each([
    { query: { client_id: "cliente-invalido" }, message: "client_id inválido." },
    { query: { assignment: "anyone" }, message: "assignment inválido." },
  ])("rejeita filtro inválido com mensagem específica: $message", ({ query, message }) => {
    expect(() => parseWithZod(taskListQuerySchema, query)).toThrowError(
      expect.objectContaining({ statusCode: 400, message }),
    );
  });
});
