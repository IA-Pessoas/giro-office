import { describe, expect, it } from "vitest";

import { buildRegularizeServiceOpenApiSpec } from "../openapi/spec.js";
import {
  buildLicenseStatusFilter,
  buildProcessStatusFilter,
  guidanceWriteStatusSchema,
  licenseWriteStatusSchema,
  processReadStatusSchema,
  processWriteStatusSchema,
} from "../schemas/status.schemas.js";

describe("regularize status contracts", () => {
  it("accepts only canonical process statuses on writes", () => {
    expect(processWriteStatusSchema.safeParse("Andamento").success).toBe(true);
    expect(processWriteStatusSchema.safeParse("Aberto").success).toBe(false);
    expect(processWriteStatusSchema.safeParse("Em andamento").success).toBe(false);
  });

  it("keeps legacy process aliases readable and maps them to the same filter", () => {
    expect(processReadStatusSchema.safeParse("Aberto").success).toBe(true);
    expect(buildProcessStatusFilter("Aberto")).toEqual({
      status: { in: ["Andamento", "Aberto", "Em andamento"] },
    });
  });

  it("accepts only canonical guidance and license statuses on writes", () => {
    expect(guidanceWriteStatusSchema.safeParse("Em andamento").success).toBe(true);
    expect(guidanceWriteStatusSchema.safeParse("Concluído").success).toBe(false);
    expect(licenseWriteStatusSchema.safeParse("Em Andamento").success).toBe(true);
    expect(licenseWriteStatusSchema.safeParse("Ativo").success).toBe(false);
  });

  it("keeps legacy license filters readable without changing stored values", () => {
    expect(buildLicenseStatusFilter("Ativo")).toEqual({ status: "Ativo" });
    expect(buildLicenseStatusFilter("Todos")).toEqual({});
  });

  it("documents the access boundary and status compatibility in OpenAPI", () => {
    const spec = buildRegularizeServiceOpenApiSpec({ port: 3039 });
    const processPath = spec.paths["/regularize/processes"] as {
      get: { parameters: Array<{ name: string; schema: { enum: string[] } }> };
    };
    const processWritePath = spec.paths["/regularize/process"] as {
      post: {
        requestBody: {
          content: {
            "application/json": {
              schema: {
                required: string[];
                additionalProperties: boolean;
                properties: {
                  status: { enum: string[] };
                  client_pj_id: { type: string; format: string };
                };
              };
            };
          };
        };
      };
    };
    const guidanceWritePath = spec.paths["/regularize/guidance"] as {
      post: {
        requestBody: {
          content: {
            "application/json": { schema: { properties: { status: { enum: string[] } } } };
          };
        };
      };
    };
    const licenseWritePath = spec.paths["/regularize/license"] as {
      post: {
        requestBody: {
          content: {
            "application/json": { schema: { properties: { status: { enum: string[] } } } };
          };
        };
      };
    };
    const licensePath = spec.paths["/regularize/licenses"] as {
      get: { parameters: Array<{ name: string; schema: { enum: string[] } }> };
    };

    expect(spec.info.description).toContain(
      "permissao Regularize 1 para leitura e 2 para mutacoes",
    );
    expect(
      processPath.get.parameters.find((parameter) => parameter.name === "status")?.schema.enum,
    ).toEqual(expect.arrayContaining(["Andamento", "Aberto", "Em andamento"]));
    expect(
      licensePath.get.parameters.find((parameter) => parameter.name === "status")?.schema.enum,
    ).toEqual(expect.arrayContaining(["Em Andamento", "Ativo"]));
    expect(
      processWritePath.post.requestBody.content["application/json"].schema.properties.status.enum,
    ).toEqual(
      expect.arrayContaining(["Pendente", "Andamento", "Protocolado", "Finalizado", "Paralisado"]),
    );
    expect(
      processWritePath.post.requestBody.content["application/json"].schema.additionalProperties,
    ).toBe(false);
    expect(processWritePath.post.requestBody.content["application/json"].schema.required).toEqual(
      expect.arrayContaining(["cpf_cnpj", "process_type", "description", "status"]),
    );
    expect(
      processWritePath.post.requestBody.content["application/json"].schema.properties.client_pj_id,
    ).toEqual({ type: "string", format: "uuid" });
    expect(
      guidanceWritePath.post.requestBody.content["application/json"].schema.properties.status.enum,
    ).toEqual(expect.arrayContaining(["Em andamento", "Finalizado"]));
    expect(
      licenseWritePath.post.requestBody.content["application/json"].schema.properties.status.enum,
    ).toEqual(
      expect.arrayContaining([
        "Em Processo de Solicitação",
        "Em Andamento",
        "Finalizado",
        "Paralisado",
      ]),
    );

    const sendToFiscalPath = spec.paths["/regularize/process/send-to-fiscal"] as {
      post: {
        summary: string;
        security: Array<Record<string, string[]>>;
        requestBody: {
          content: {
            "application/json": {
              schema: { required: string[]; properties: { id: { format: string } } };
            };
          };
        };
      };
    };
    const returnFromFiscalPath = spec.paths["/regularize/process/return-from-fiscal"] as {
      post: { summary: string };
    };

    expect(sendToFiscalPath.post.summary).toContain("envio");
    expect(sendToFiscalPath.post.security).toEqual([{ bearerAuth: [] }]);
    expect(sendToFiscalPath.post.requestBody.content["application/json"].schema.required).toEqual([
      "id",
    ]);
    expect(
      sendToFiscalPath.post.requestBody.content["application/json"].schema.properties.id.format,
    ).toBe("uuid");
    expect(returnFromFiscalPath.post.summary).toContain("retorno");
  });
});
