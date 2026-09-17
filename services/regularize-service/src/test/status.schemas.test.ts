import { describe, expect, it } from "vitest";

import { buildRegularizeServiceOpenApiSpec } from "../openapi/spec.js";
import {
  buildLicenseStatusFilter,
  buildProcessStatusFilter,
  getLicenseDueDateBounds,
  getLicenseNotificationDateRange,
  guidanceWriteStatusSchema,
  licenseUpdateStatusSchema,
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
    expect(licenseUpdateStatusSchema.safeParse("Ativo").success).toBe(true);
  });

  it("keeps legacy license filters readable without changing stored values", () => {
    expect(buildLicenseStatusFilter("Ativo")).toEqual({ status: "Ativo" });
    expect(buildLicenseStatusFilter("Todos")).toEqual({});
  });

  it("derives license due filters from due_date", () => {
    const referenceDate = new Date("2026-03-16T12:00:00.000Z");
    const bounds = getLicenseDueDateBounds(referenceDate);
    const dueDateFilter = buildLicenseStatusFilter("A vencer", referenceDate);

    expect(dueDateFilter).toEqual({
      due_date: {
        gte: bounds.today,
        lt: new Date(bounds.nextMonth.getTime() + 24 * 60 * 60 * 1000),
      },
    });
    expect(buildLicenseStatusFilter("Vencido", referenceDate)).toEqual({
      due_date: { lt: bounds.today },
    });
  });

  it("uses a calendar-month date range for license notifications", () => {
    const referenceDate = new Date("2026-01-31T12:00:00.000Z");
    const range = getLicenseNotificationDateRange(referenceDate);

    expect(range.gte.getUTCDate()).toBe(28);
    expect(range.gte.getUTCMonth()).toBe(1);
    expect(range.lt.getUTCDate()).toBe(1);
    expect(range.lt.getUTCMonth()).toBe(2);
  });

  it("includes the end of the following month when the reference date is month-end", () => {
    const referenceDate = new Date("2026-02-28T12:00:00.000Z");
    const range = getLicenseNotificationDateRange(referenceDate);

    expect(range).toEqual({
      gte: new Date("2026-03-28T00:00:00.000Z"),
      lt: new Date("2026-04-01T00:00:00.000Z"),
    });
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
      put: {
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
    expect(
      licenseWritePath.put.requestBody.content["application/json"].schema.properties.status.enum,
    ).toEqual(expect.arrayContaining(["Ativo", "Pendente", "Inativo", "Cancelado"]));

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

  it("documents the independent guidance contract with the complete checklist", () => {
    const spec = buildRegularizeServiceOpenApiSpec({ port: 3039 });
    const guidancePath = spec.paths["/regularize/guidance"] as {
      post: {
        security: Array<Record<string, string[]>>;
        requestBody: {
          content: {
            "application/json": {
              schema: {
                additionalProperties: boolean;
                required: string[];
                properties: {
                  request: { type: string; nullable: boolean };
                  company_name: { type: string; nullable: boolean };
                  address: { type: string; nullable: boolean };
                  economic_activities: {
                    nullable: boolean;
                    items: { additionalProperties: boolean };
                  };
                  partners: { nullable: boolean; items: { additionalProperties: boolean } };
                  process_id: { nullable: boolean };
                  target_type: { enum: string[] };
                  target_snapshot: {
                    additionalProperties: boolean;
                    properties: Record<string, unknown>;
                  };
                  checklist: {
                    minItems: number;
                    maxItems: number;
                    items: { properties: { status: { enum: string[] } } };
                  };
                  branch_data: { additionalProperties: boolean };
                };
              };
            };
          };
        };
        responses: Record<string, unknown>;
      };
      put: { responses: Record<string, unknown> };
    };
    const listPath = spec.paths["/regularize/guidance/list"] as {
      get: {
        security: Array<Record<string, string[]>>;
        parameters: Array<{ name: string; required: boolean; schema: { nullable: boolean } }>;
        responses: Record<string, unknown>;
      };
    };

    const schema = guidancePath.post.requestBody.content["application/json"].schema;
    expect(guidancePath.post.security).toEqual([{ bearerAuth: [] }]);
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toEqual(expect.arrayContaining(["target_type", "checklist", "status"]));
    expect(schema.properties.request).toEqual({ type: "string" });
    expect(schema.properties.company_name).toEqual({ type: "string" });
    expect(schema.properties.address).toEqual({ type: "string" });
    expect(schema.properties.economic_activities.items.additionalProperties).toBe(false);
    expect(schema.properties.partners.items.additionalProperties).toBe(false);
    expect(schema.properties.process_id.nullable).toBe(true);
    expect(schema.properties.target_type.enum).toEqual(["PJ", "PF", "SEM_CLIENTE"]);
    expect(schema.properties.target_snapshot.additionalProperties).toBe(false);
    expect(schema.properties.target_snapshot.properties).toEqual(
      expect.objectContaining({
        document: { type: "string" },
        type: { type: "string" },
        request: { type: "string" },
        framework_obs: { type: "string" },
        economic_activities: expect.objectContaining({ type: "array" }),
        partners: expect.objectContaining({ type: "array" }),
        status: { type: "string", enum: ["Em andamento", "Finalizado"] },
      }),
    );
    expect(schema.properties.target_snapshot.properties).not.toHaveProperty("custom_note");
    expect(schema.properties.checklist.minItems).toBe(17);
    expect(schema.properties.checklist.maxItems).toBe(17);
    expect(schema.properties.checklist.items.properties.status.enum).toEqual([
      "Pendente",
      "Concluído",
      "Não se aplica",
    ]);
    expect(schema.properties.branch_data.additionalProperties).toBe(false);

    const responseSchema = (
      guidancePath.post.responses["201"] as {
        content: {
          "application/json": {
            schema: {
              additionalProperties: boolean;
              properties: {
                data: {
                  required: string[];
                  properties: {
                    organization_id: { type: string };
                    request: { type: string; nullable: boolean };
                    company_name: { type: string; nullable: boolean };
                    address: { type: string; nullable: boolean };
                    economic_activities: {
                      nullable: boolean;
                      items: { additionalProperties: boolean };
                    };
                    partners: { nullable: boolean; items: { additionalProperties: boolean } };
                    target_snapshot: {
                      additionalProperties: boolean;
                      required: string[];
                      properties: Record<string, unknown>;
                    };
                    checklist_items: {
                      items: {
                        additionalProperties: boolean;
                        required: string[];
                        properties: {
                          guidance_id: { type: string };
                          label: { type: string };
                          observation: { type: string; nullable: boolean };
                          created_at: { type: string; format: string };
                          updated_at: { type: string; format: string };
                        };
                      };
                    };
                  };
                };
              };
            };
          };
        };
      }
    ).content["application/json"].schema;
    const responseData = responseSchema.properties.data;
    expect(responseSchema.additionalProperties).toBe(false);
    expect(responseData.required).toEqual(
      expect.arrayContaining([
        "id",
        "organization_id",
        "process_id",
        "target_type",
        "target_snapshot",
        "checklist_items",
        "branch_data",
      ]),
    );
    expect(responseData.properties.organization_id).toEqual({ type: "string", format: "uuid" });
    expect(responseData.properties.request).toEqual({ type: "string", nullable: true });
    expect(responseData.properties.company_name).toEqual({ type: "string", nullable: true });
    expect(responseData.properties.address).toEqual({ type: "string", nullable: true });
    expect(responseData.properties.economic_activities.items.additionalProperties).toBe(false);
    expect(responseData.properties.partners.items.additionalProperties).toBe(false);
    expect(responseData.properties.target_snapshot.additionalProperties).toBe(false);
    expect(responseData.properties.target_snapshot.required).toEqual(["version", "source"]);
    expect(responseData.properties.target_snapshot.properties).toEqual(
      expect.objectContaining({
        type: { type: "string" },
        request: { type: "string" },
        framework_obs: { type: "string" },
        company_name: { type: "string" },
        trade_name: { type: "string" },
        cpf_cnpj: { type: "string" },
        legal_nature: { type: "string" },
        share_capital: { oneOf: [{ type: "number" }, { type: "string" }] },
        iptu: { type: "string" },
        address: { type: "string" },
        comporate_purpose: { type: "string" },
        carryng: { type: "string" },
        regime: { type: "string" },
        legal_representative: { type: "string" },
        status: { type: "string", enum: ["Em andamento", "Finalizado"] },
      }),
    );
    expect(responseData.properties.target_snapshot.properties.economic_activities).toEqual({
      type: "array",
      items: expect.objectContaining({ additionalProperties: false }),
    });
    expect(responseData.properties.target_snapshot.properties.partners).toEqual({
      type: "array",
      items: expect.objectContaining({ additionalProperties: false }),
    });
    expect(responseData.properties.target_snapshot.properties).not.toHaveProperty("custom_note");

    const migratedTargetSnapshot = {
      version: 1,
      source: "client_pj",
      name: "Empresa Migrada",
      document: "12345678000199",
      type: "Abertura",
      request: "Regularizar cadastro",
      framework_obs: "Observação histórica",
      legal_nature: "Sociedade empresária limitada",
      company_name: "Empresa Migrada LTDA",
      trade_name: "Empresa Migrada",
      cpf_cnpj: "12345678000199",
      share_capital: 100000,
      iptu: "IPTU-001",
      address: "Rua A, 100",
      comporate_purpose: "Comércio varejista",
      carryng: "Pequeno porte",
      regime: "Simples Nacional",
      legal_representative: "Pessoa Representante",
      economic_activities: [{ code: "4711-3/01", description: "Comércio", type: "Principal" }],
      partners: [{ name: "Sócio", cpf: "12345678901" }],
      status: "Em andamento",
    };
    for (const field of Object.keys(migratedTargetSnapshot)) {
      expect(responseData.properties.target_snapshot.properties).toHaveProperty(field);
    }
    expect(responseData.properties.checklist_items.items.additionalProperties).toBe(false);
    expect(responseData.properties.checklist_items.items.required).toEqual(
      expect.arrayContaining([
        "id",
        "guidance_id",
        "code",
        "label",
        "status",
        "observation",
        "created_at",
        "updated_at",
      ]),
    );
    expect(responseData.properties.checklist_items.items.properties.observation).toEqual({
      type: "string",
      nullable: true,
    });
    expect(Object.keys(guidancePath.post.responses)).toEqual(
      expect.arrayContaining(["201", "404", "409", "422"]),
    );
    expect(Object.keys(guidancePath.put.responses)).toEqual(
      expect.arrayContaining(["200", "404", "409", "422"]),
    );
    expect(listPath.get.security).toEqual([{ bearerAuth: [] }]);
    expect(listPath.get.parameters).toContainEqual({
      name: "process_id",
      in: "query",
      required: false,
      schema: { type: "string", format: "uuid", nullable: true },
    });
    expect(listPath.get.parameters).toContainEqual({
      name: "target_type",
      in: "query",
      required: false,
      schema: { type: "string", enum: ["PJ", "PF", "SEM_CLIENTE"] },
    });
    expect(Object.keys(listPath.get.responses)).toEqual(expect.arrayContaining(["200", "404"]));
  });
});
