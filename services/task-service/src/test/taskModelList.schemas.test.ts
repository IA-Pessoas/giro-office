import { parseWithZod, ServiceError } from "@workspace/shared";
import { describe, expect, it } from "vitest";

import { taskModelListQuerySchema } from "../schemas/taskModelList.schemas.js";

describe("task model list query schema", () => {
  it("aceita busca e pagina", () => {
    expect(
      parseWithZod(taskModelListQuerySchema, {
        search: " Fiscal ",
        page: "2",
        limit: "20",
      }),
    ).toMatchObject({ search: "Fiscal", page: 2, limit: 20 });
  });

  it.each([{ page: "0" }, { limit: "101" }, { page: "x" }])(
    "rejeita paginacao invalida: %o",
    (query) => {
      expect(() => parseWithZod(taskModelListQuerySchema, query)).toThrow(ServiceError);
    },
  );
});
