import { expect, it } from "vitest";

import { executeProjectReportingQuery } from "./projectReporting.js";

it("conta linhas separadamente dos valores preenchidos", async () => {
  const result = await executeProjectReportingQuery(
    {
      source: "integracao.projects",
      fields: ["name"],
      limit: 10,
      query: {
        aggregations: [
          { field: "name", function: "count_rows", alias: "rows" },
          { field: "name", function: "count", alias: "named" },
        ],
      },
    },
    async () => ({ rows: [{ name: "Projeto" }, { name: null }], reachedLimit: false }),
  );

  expect(result.rows).toEqual([{ rows: 2, named: 1 }]);
});
