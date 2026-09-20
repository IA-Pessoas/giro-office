import assert from "node:assert/strict";
import { test } from "node:test";

import { executeReportingQuery } from "../src/reporting/reportingQuery.js";

test("combines an AND group with ungrouped criteria before limiting", async () => {
  const result = await executeReportingQuery(
    {
      source: "integracao.projects",
      fields: ["name"],
      limit: 1,
      query: {
        filters: [
          { field: "porcentage", operator: "gt", parameter: "minimum", value: 100 },
          { field: "status", operator: "eq", parameter: "status", value: "Open" },
          { field: "name", operator: "neq", parameter: "excluded", value: "Project 148" },
        ],
        filter_groups: [{ operator: "and", filters: ["minimum", "status"] }],
        order_by: [{ field: "porcentage", direction: "desc" }],
      },
    },
    async () => ({
      rows: Array.from({ length: 150 }, (_, index) => ({
        name: `Project ${index}`,
        porcentage: index,
        status: index === 149 ? "Closed" : "Open",
      })),
      reachedLimit: false,
    }),
  );
  assert.deepEqual(result.rows, [{ name: "Project 147" }]);
});

test("preserves input tie order and places nulls after ascending values", async () => {
  const result = await executeReportingQuery(
    {
      source: "integracao.projects",
      fields: ["name"],
      limit: 3,
      query: { order_by: [{ field: "porcentage", direction: "asc" }] },
    },
    async () => ({
      rows: [
        { name: "Null", porcentage: null },
        { name: "First", porcentage: 2 },
        { name: "Second", porcentage: 2 },
      ],
      reachedLimit: false,
    }),
  );
  assert.deepEqual(result.rows, [{ name: "First" }, { name: "Second" }, { name: "Null" }]);
});

test("filters the complete authorized set before the preview limit", async () => {
  const rows = Array.from({ length: 150 }, (_, index) => ({ name: `Project ${index}` }));
  const result = await executeReportingQuery(
    {
      source: "integracao.projects",
      fields: ["name"],
      limit: 1,
      query: {
        filters: [{ field: "name", operator: "eq", parameter: "name", value: "Project 149" }],
      },
    },
    async () => ({ rows, reachedLimit: false }),
  );
  assert.deepEqual(result, { rows: [{ name: "Project 149" }], reachedLimit: false });
});

test("combines OR filters and sorts before cutting the complete set", async () => {
  const result = await executeReportingQuery(
    {
      source: "integracao.projects",
      fields: ["name"],
      limit: 1,
      query: {
        filters: [
          { field: "name", operator: "eq", parameter: "first", value: "A" },
          { field: "name", operator: "eq", parameter: "last", value: "Z" },
        ],
        filter_groups: [{ operator: "or", filters: ["first", "last"] }],
        order_by: [{ field: "name", direction: "desc" }],
      },
    },
    async () => ({ rows: [{ name: "A" }, { name: "B" }, { name: "Z" }], reachedLimit: false }),
  );
  assert.deepEqual(result, { rows: [{ name: "Z" }], reachedLimit: true });
});

test("rejects unpublished fields before loading any data", async () => {
  let loaded = false;
  await assert.rejects(
    executeReportingQuery(
      {
        source: "integracao.projects",
        fields: ["name"],
        limit: 1,
        query: {
          filters: [
            { field: "organization_id", operator: "eq", parameter: "org", value: "another-org" },
          ],
        },
      },
      async () => {
        loaded = true;
        return { rows: [], reachedLimit: false };
      },
    ),
    { statusCode: 403 },
  );
  assert.equal(loaded, false);
});

test("groups and summarizes all 150 rows before limiting groups", async () => {
  const result = await executeReportingQuery(
    {
      source: "integracao.projects",
      fields: ["status"],
      limit: 1,
      query: {
        group_by: ["status"],
        aggregations: [
          { field: "porcentage", function: "count", alias: "total" },
          { field: "porcentage", function: "sum", alias: "sum" },
          { field: "porcentage", function: "avg", alias: "average" },
        ],
      },
    },
    async () => ({
      rows: Array.from({ length: 150 }, () => ({ status: "Open", porcentage: 2 })),
      reachedLimit: false,
    }),
  );
  assert.deepEqual(result, {
    rows: [{ status: "Open", total: 150, sum: 300, average: 2 }],
    reachedLimit: false,
  });
});

test("compares typed numbers instead of strings and applies advertised operators", async () => {
  const result = await executeReportingQuery(
    {
      source: "integracao.projects",
      fields: ["name"],
      limit: 2,
      query: {
        filters: [{ field: "porcentage", operator: "between", parameter: "range", value: [2, 12] }],
        order_by: [{ field: "porcentage", direction: "desc" }],
      },
    },
    async () => ({
      rows: [
        { name: "two", porcentage: 2 },
        { name: "twelve", porcentage: 12 },
        { name: "outside", porcentage: 13 },
      ],
      reachedLimit: false,
    }),
  );
  assert.deepEqual(result.rows, [{ name: "twelve" }, { name: "two" }]);
});

test("rejects unsupported operators, invalid types and missing group references", async () => {
  for (const query of [
    { filters: [{ field: "name", operator: "sql", parameter: "p", value: "x" }] },
    { filters: [{ field: "porcentage", operator: "gt", parameter: "p", value: "2" }] },
    { filter_groups: [{ operator: "or", filters: ["missing"] }] },
  ]) {
    await assert.rejects(
      executeReportingQuery(
        { source: "integracao.projects", fields: ["name"], limit: 1, query },
        async () => ({ rows: [], reachedLimit: false }),
      ),
      { statusCode: 400 },
    );
  }
});

test("refuses truncation and invalid summaries instead of returning partial data", async () => {
  await assert.rejects(
    executeReportingQuery(
      { source: "integracao.projects", fields: ["name"], limit: 1, query: {} },
      async () => ({ rows: [], reachedLimit: true }),
    ),
    { statusCode: 422 },
  );
  await assert.rejects(
    executeReportingQuery(
      {
        source: "integracao.projects",
        fields: ["name"],
        limit: 1,
        query: { aggregations: [{ field: "name", function: "sum", alias: "total" }] },
      },
      async () => ({ rows: [], reachedLimit: false }),
    ),
    { statusCode: 400 },
  );
});

test("defines empty summaries and date extrema without losing value types", async () => {
  const input = {
    source: "integracao.projects",
    fields: ["name"],
    limit: 1,
    query: {
      aggregations: [
        { field: "start_date", function: "min" as const, alias: "first" },
        { field: "name", function: "count" as const, alias: "total" },
      ],
    },
  };
  const empty = await executeReportingQuery(input, async () => ({ rows: [], reachedLimit: false }));
  assert.deepEqual(empty.rows, [{ first: null, total: 0 }]);
  const dates = await executeReportingQuery(input, async () => ({
    rows: [
      { name: "B", start_date: "2026-09-02" },
      { name: "A", start_date: "2026-09-01" },
    ],
    reachedLimit: false,
  }));
  assert.deepEqual(dates.rows, [{ first: "2026-09-01", total: 2 }]);
});

test("stops loading pages as soon as the byte budget is exceeded", async () => {
  let calls = 0;
  await assert.rejects(
    executeReportingQuery(
      { source: "integracao.projects", fields: ["name"], limit: 1, query: {} },
      async (_fields, limit, offset) => {
        calls++;
        assert.equal(limit, 100);
        assert.equal(offset, (calls - 1) * 100);
        return {
          rows: Array.from({ length: 100 }, () => ({ name: "x".repeat(110_000) })),
          reachedLimit: true,
        };
      },
    ),
    { statusCode: 422 },
  );
  assert.equal(calls, 2);
});

test("rejects numeric overflow instead of serializing a false null summary", async () => {
  await assert.rejects(
    executeReportingQuery(
      {
        source: "integracao.projects",
        fields: ["name"],
        limit: 1,
        query: { aggregations: [{ field: "porcentage", function: "sum", alias: "total" }] },
      },
      async () => ({
        rows: [{ porcentage: Number.MAX_VALUE }, { porcentage: Number.MAX_VALUE }],
        reachedLimit: false,
      }),
    ),
    { statusCode: 422 },
  );
});
