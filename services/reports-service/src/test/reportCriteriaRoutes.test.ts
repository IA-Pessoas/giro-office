import { createHash, createHmac, randomUUID } from "node:crypto";
import { createExpressErrorHandler } from "@workspace/shared";
import express from "express";
import { createInternalReportingRouter as certificateRouter } from "../../../certificate-service/src/routes/internalReporting.routes.js";
import { createInternalReportingRouter as clientRouter } from "../../../client-service/src/routes/internalReporting.routes.js";
import { createInternalReportingRouter as contabilRouter } from "../../../contabil-service/src/routes/internalReporting.routes.js";
import { createInternalReportingRouter as fiscalRouter } from "../../../fiscal-service/src/routes/internalReporting.routes.js";
import { createInternalReportingRouter as parcelamentoRouter } from "../../../parcelamento-service/src/routes/internalReporting.routes.js";
import { createInternalReportingRouter as pessoalRouter } from "../../../pessoal-service/src/routes/internalReporting.routes.js";
import { createInternalReportingRouter as projectRouter } from "../../../project-service/src/routes/internalReporting.routes.js";
import { createInternalReportingRouter as regularizeRouter } from "../../../regularize-service/src/routes/internalReporting.routes.js";
import { createInternalReportingRouter as rhRouter } from "../../../rh-service/src/routes/internalReporting.routes.js";
import { createInternalReportingRouter as taskRouter } from "../../../task-service/src/routes/internalReporting.routes.js";
import { createInternalReportingRouter as tiRouter } from "../../../ti-service/src/routes/internalReporting.routes.js";
import "express-async-errors";
import request from "supertest";
import { expect, it, vi } from "vitest";
import { reportingSources } from "../../../../shared/src/reporting/reportingSources.js";

const routers = {
  project: projectRouter,
  rh: rhRouter,
  fiscal: fiscalRouter,
  pessoal: pessoalRouter,
  certificate: certificateRouter,
  contabil: contabilRouter,
  parcelamento: parcelamentoRouter,
  ti: tiRouter,
  client: clientRouter,
  task: taskRouter,
  regularize: regularizeRouter,
};
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
for (const source of reportingSources) {
  it(`${source.key}: verifies all fields and signed criteria at the HTTP boundary`, async () => {
    const service =
      source.key === "integracao.projects"
        ? "project"
        : source.key === "integracao.tasks"
          ? "task"
          : source.key === "integracao.clients"
            ? "client"
            : source.key.startsWith("certificado.")
              ? "certificate"
              : source.key.split(".")[0];
    const router = routers[service as keyof typeof routers];
    const extract = vi.fn().mockResolvedValue({ rows: [], reachedLimit: false });
    const stub = { extract, consumeGrant: vi.fn() };
    const app = express();
    app.use(express.json());
    app.use(
      "/internal",
      router({
        env: new Proxy({}, { get: () => "fixture-secret" }),
        reportingService: stub,
        municipalTaxesReportingService: stub,
      } as never),
    );
    app.use(
      createExpressErrorHandler({
        logger: { error: vi.fn() } as never,
        event: "test",
        fallbackMessage: "Erro",
      }),
    );
    const column = source.fields[0].key;
    const order = (source.fields[1] ?? source.fields[0]).key;
    const body = {
      source: source.key,
      fields: [column],
      limit: 1,
      query: { order_by: [{ field: order, direction: "asc" }] },
    };
    const requestId = randomUUID();
    const issuedAt = Math.floor(Date.now() / 1000);
    const grant = Buffer.from(
      canonical({
        version: 1,
        audience: `${service}-service`,
        operation: "extract",
        source: source.key,
        fields: [...new Set([column, order])],
        organization_id: "00000000-0000-4000-8000-000000000001",
        request_id: requestId,
        issued_at: issuedAt,
        expires_at: issuedAt + 60,
        body_sha256: createHash("sha256").update(canonical(body)).digest("hex"),
      }),
    ).toString("base64url");
    const send = (payload: unknown) =>
      request(app)
        .post("/internal/reporting/extract")
        .set("x-internal-service-token", "fixture-secret")
        .set("x-request-id", requestId)
        .set("x-reports-grant", grant)
        .set(
          "x-reports-grant-signature",
          createHmac("sha256", "fixture-secret").update(grant).digest("hex"),
        )
        .send(payload);
    await send(body).expect(200);
    expect(extract).toHaveBeenCalledWith(
      expect.objectContaining({
        query: body.query,
        organizationId: "00000000-0000-4000-8000-000000000001",
      }),
    );
    await send({ ...body, query: { order_by: [{ field: order, direction: "desc" }] } }).expect(403);
    await send({
      ...body,
      query: { aggregations: [{ field: column, function: "count", alias: "total" }] },
    }).expect(403);
    if (column !== order) {
      const insufficientGrant = Buffer.from(
        canonical({ ...JSON.parse(Buffer.from(grant, "base64url").toString()), fields: [column] }),
      ).toString("base64url");
      await request(app)
        .post("/internal/reporting/extract")
        .set("x-internal-service-token", "fixture-secret")
        .set("x-request-id", requestId)
        .set("x-reports-grant", insufficientGrant)
        .set(
          "x-reports-grant-signature",
          createHmac("sha256", "fixture-secret").update(insufficientGrant).digest("hex"),
        )
        .send(body)
        .expect(403);
    }
  });
}
