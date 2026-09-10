import { expect, it } from "vitest";
import { buildCertificateServiceOpenApiSpec } from "../../../certificate-service/src/openapi/spec.js";
import { buildClientServiceOpenApiSpec } from "../../../client-service/src/openapi/spec.js";
import { buildContabilServiceOpenApiSpec } from "../../../contabil-service/src/openapi/spec.js";
import { buildFiscalServiceOpenApiSpec } from "../../../fiscal-service/src/openapi/spec.js";
import { buildParcelamentoServiceOpenApiSpec } from "../../../parcelamento-service/src/openapi/spec.js";
import { buildPessoalServiceOpenApiSpec } from "../../../pessoal-service/src/openapi/spec.js";
import { buildProjectServiceOpenApiSpec } from "../../../project-service/src/openapi/spec.js";
import { buildRegularizeServiceOpenApiSpec } from "../../../regularize-service/src/openapi/spec.js";
import { buildRhServiceOpenApiSpec } from "../../../rh-service/src/openapi/spec.js";
import { buildTaskServiceOpenApiSpec } from "../../../task-service/src/openapi/spec.js";
import { buildTiServiceOpenApiSpec } from "../../../ti-service/src/openapi/spec.js";

for (const build of [
  buildProjectServiceOpenApiSpec,
  buildRhServiceOpenApiSpec,
  buildFiscalServiceOpenApiSpec,
  buildPessoalServiceOpenApiSpec,
  buildCertificateServiceOpenApiSpec,
  buildContabilServiceOpenApiSpec,
  buildParcelamentoServiceOpenApiSpec,
  buildTiServiceOpenApiSpec,
  buildClientServiceOpenApiSpec,
  buildTaskServiceOpenApiSpec,
  buildRegularizeServiceOpenApiSpec,
]) {
  it(`${build.name}: documents executable optional query and capacity error`, () => {
    const spec = build({ port: 3000 } as never);
    expect(spec.paths["/internal/reporting/extract"]).toMatchObject({
      post: {
        requestBody: {
          content: {
            "application/json": {
              schema: {
                properties: {
                  query: {
                    properties: {
                      filters: { type: "array" },
                      filter_groups: { type: "array" },
                      order_by: { type: "array" },
                      group_by: { type: "array" },
                      aggregations: { type: "array" },
                    },
                  },
                },
              },
            },
          },
        },
        responses: { "422": expect.any(Object) },
      },
    });
  });
}
