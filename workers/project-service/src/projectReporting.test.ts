import { expect, it } from "vitest";

import { executeProjectReportingQuery } from "./projectReporting.js";

it("conta todas as linhas do grupo, inclusive valores nulos", async () => {
  const result = await executeProjectReportingQuery(
    {
      source: "integracao.projects",
      fields: ["status"],
      limit: 10,
      query: {
        group_by: ["status"],
        aggregations: [{ field: "name", function: "count_rows", alias: "total" }],
      },
    },
    async () => ({
      rows: [
        { status: "Ativo", name: "Projeto" },
        { status: "Ativo", name: null },
      ],
      reachedLimit: false,
    }),
  );

  expect(result.rows).toEqual([{ status: "Ativo", total: 2 }]);
});
