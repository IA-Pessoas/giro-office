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

  it.each([{ page: "0" }, { limit: "101" }, { page: "1.5" }])(
    "rejeita limites invalidos com 400: %o",
    (query) => {
      expect(() => parseWithZod(taskListQuerySchema, query)).toThrow(ServiceError);
    },
  );
});
