import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import { buildTaskServiceOpenApiSpec } from "../openapi/spec.js";
import { createTestApp, resetTaskRouteMocks, taskAttachmentServiceMock } from "./taskTestUtils.js";

describe("rotas de anexos de tarefa", () => {
  beforeEach(resetTaskRouteMocks);

  it("valida a assinatura antes de encaminhar o upload", async () => {
    const response = await request(createTestApp())
      .post("/task/attachment")
      .field("task_id", "task-1")
      .attach("file", Buffer.from("not a pdf"), {
        filename: "evidencia.pdf",
        contentType: "application/pdf",
      });

    expect(response.status).toBe(400);
    expect(taskAttachmentServiceMock.upload).not.toHaveBeenCalled();
  });

  it("recusa arquivo acima de 10 MB antes de encaminhar o upload", async () => {
    const response = await request(createTestApp())
      .post("/task/attachment")
      .field("task_id", "task-1")
      .attach("file", Buffer.alloc(10 * 1024 * 1024 + 1), {
        filename: "evidencia.pdf",
        contentType: "application/pdf",
      });

    expect(response.status).toBe(400);
    expect(taskAttachmentServiceMock.upload).not.toHaveBeenCalled();
  });

  it("não expõe caminho interno ao listar anexos", async () => {
    taskAttachmentServiceMock.list.mockResolvedValue([
      {
        id: "attachment-1",
        original_name: "evidencia.pdf",
        mime_type: "application/pdf",
        size_bytes: 12,
        created_at: "2026-09-17T00:00:00.000Z",
      },
    ]);

    const response = await request(createTestApp()).get("/task/attachment/list?task_id=task-1");

    expect(response.status).toBe(200);
    expect(response.body).not.toContain("object_path");
  });

  it("documenta upload multipart e acesso assinado no OpenAPI", () => {
    const paths = buildTaskServiceOpenApiSpec({ port: 3032 } as never).paths;
    expect(paths["/task/attachment"].post.requestBody.content).toHaveProperty(
      "multipart/form-data",
    );
    expect(paths["/task/attachment/access"].get.security).toEqual([{ bearerAuth: [] }]);
  });
});
