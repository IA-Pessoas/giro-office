import { expect, it } from "vitest";

import { executeProjectReportingQuery } from "./projectReporting.js";

it("conta linhas do grupo separadamente dos valores preenchidos", async () => {
  const result = await executeProjectReportingQuery(
    {
      source: "integracao.projects",
      fields: ["status"],
      limit: 10,
      query: {
        group_by: ["status"],
        aggregations: [
          { field: "name", function: "count_rows", alias: "rows" },
          { field: "name", function: "count", alias: "named" },
        ],
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

  expect(result.rows).toEqual([{ status: "Ativo", rows: 2, named: 1 }]);
});
