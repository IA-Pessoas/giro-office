import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildTaskServiceOpenApiSpec } from "../openapi/spec.js";

describe("expansão do responsável de tarefa #981", () => {
  it("OpenAPI aceita null em tarefas e mantém modelos obrigatórios", () => {
    const spec = buildTaskServiceOpenApiSpec({ port: 3032 } as never);
    for (const [path, method] of [
      ["/task", "post"],
      ["/task", "put"],
      ["/task/conclusion", "put"],
    ]) {
      const operation = spec.paths[path]?.[method] as {
        requestBody: {
          content: {
            "application/json": { schema: { properties: { responsible_id: { type: unknown } } } };
          };
        };
      };
      expect(
        operation.requestBody.content["application/json"].schema.properties.responsible_id.type,
      ).toEqual(["string", "null"]);
    }
    expect(JSON.stringify(spec.paths["/task/model"])).toContain(
      '"responsible_id":{"type":"string"}',
    );

    const taskPath = spec.paths["/task"] as {
      post: {
        requestBody: { content: { "application/json": { schema: { required: string[] } } } };
      };
      put: {
        requestBody: {
          content: { "application/json": { schema: { properties: Record<string, unknown> } } };
        };
      };
    };
    expect(taskPath.post.requestBody.content["application/json"].schema.required).toContain(
      "department_id",
    );
    expect(taskPath.put.requestBody.content["application/json"].schema.properties).toHaveProperty(
      "model_id",
    );
  });
  it("torna apenas Task anulável e preserva a política da relação legada", () => {
    const schema = readFileSync(
      new URL("../../../../infra/prisma/schema.prisma", import.meta.url),
      "utf8",
    );
    const task = schema.match(/model Task \{([\s\S]*?)\n\}/)?.[1] ?? "";
    const model = schema.match(/model TaskModel \{([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(task).toMatch(/responsible_id\s+String\?/);
    expect(task).toMatch(
      /responsible\s+User\?\s+@relation\("responsible", fields: \[responsible_id\], references: \[id\], onDelete: Restrict\)/,
    );
    expect(model).toMatch(/responsible_id\s+String\s/);
    expect(model).toMatch(/responsible\s+User\s+@relation/);
    const migration = readFileSync(
      new URL(
        "../../../../infra/prisma/migrations/20260906004000_task_responsible_nullable/migration.sql",
        import.meta.url,
      ),
      "utf8",
    );
    expect(migration.replace(/^--.*$/gm, "").trim()).toBe(
      'ALTER TABLE "integracao.tasks" ALTER COLUMN "responsible_id" DROP NOT NULL;',
    );
  });
});
