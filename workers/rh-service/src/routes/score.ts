import {
  decideNitroHoursBodySchema,
  listNitroHoursQuerySchema,
  nitroHoursIdParamsSchema,
  submitNitroHoursBodySchema,
} from "@workspace/rh-service/src/schemas/nitroHours.schemas.js";
import { submitScoreEvaluationBodySchema } from "@workspace/rh-service/src/schemas/scoreEvaluation.schemas.js";
import { updateScoreNitroBodySchema } from "@workspace/rh-service/src/schemas/scoreNitro.schemas.js";
import {
  generateQuarterBodySchema,
  scoreQuarterIdParamSchema,
  updateNitroBodySchema,
} from "@workspace/rh-service/src/schemas/scoreQuarter.schemas.js";
import { parseWithZod } from "@workspace/shared";
import { createSuccessResponse, ServiceError } from "@workspace/shared/http";
import { validateUploadFileSignature } from "@workspace/shared/upload";
import { requireRhPermission } from "../auth.js";
import { NitroHoursService } from "../services/nitroHoursService.js";
import {
  nitroHoursStorageFromEnv,
  RH_NITRO_HOURS_MIME_TYPES,
} from "../services/nitroHoursStorage.js";
import { ScoreEvaluationService } from "../services/scoreEvaluationService.js";
import { ScoreNitroService } from "../services/scoreNitroService.js";
import { ScoreQuarterService } from "../services/scoreQuarterService.js";
import {
  canManageRh,
  jsonBody,
  RH_MANAGEMENT_PERMISSION,
  RH_SELF_SERVICE_PERMISSION,
  type RhApp,
  type RhRouteDeps,
  trimmedQuery,
} from "./shared.js";

const MAX_NITRO_HOURS_MULTIPART_BYTES = 5 * 1024 * 1024 + 64 * 1024;

async function parseNitroHoursFormData(request: Request): Promise<FormData> {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_NITRO_HOURS_MULTIPART_BYTES) {
    throw new ServiceError(413, "O upload de certificado excede o limite permitido.");
  }

  const reader = request.body?.getReader();
  if (!reader) throw new ServiceError(400, "Upload de certificado inválido.");
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_NITRO_HOURS_MULTIPART_BYTES) {
      await reader.cancel();
      throw new ServiceError(413, "O upload de certificado excede o limite permitido.");
    }
    chunks.push(value);
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const contentType = request.headers.get("content-type");
  if (!contentType?.toLowerCase().startsWith("multipart/form-data;")) {
    throw new ServiceError(400, "Upload de certificado inválido.");
  }
  return new Response(body, { headers: { "content-type": contentType } }).formData();
}

/** `/rh/score/{evaluations,quarters,nitro}` como em `scoreEvaluation|scoreQuarter|scoreNitro.routes.ts`. */
export function registerScoreRoutes(app: RhApp, deps: RhRouteDeps): void {
  app.get("/rh/score/evaluations/pending", async (c) => {
    const auth = c.get("auth");
    requireRhPermission(auth, RH_SELF_SERVICE_PERMISSION);
    const result = await deps.withDb(c, (db) =>
      new ScoreEvaluationService(db).listPendingEvaluations(
        auth.organizationId,
        auth.userId,
        canManageRh(auth),
      ),
    );
    return c.json(createSuccessResponse(result));
  });

  app.post("/rh/score/evaluations/submit", async (c) => {
    const auth = c.get("auth");
    requireRhPermission(auth, RH_SELF_SERVICE_PERMISSION);
    const body = parseWithZod(submitScoreEvaluationBodySchema, await jsonBody(c));
    const result = await deps.withDb(c, (db) =>
      new ScoreEvaluationService(db).submitEvaluation({
        organization_id: auth.organizationId,
        user_id: auth.userId,
        can_manage: canManageRh(auth),
        evaluation_id: body.evaluation_id,
        answers: body.answers,
      }),
    );
    return c.json(createSuccessResponse(result));
  });

  app.post("/rh/score/quarters/generate", async (c) => {
    const auth = c.get("auth");
    requireRhPermission(auth, RH_MANAGEMENT_PERMISSION);
    const body = parseWithZod(generateQuarterBodySchema, await jsonBody(c));
    const result = await deps.withDb(c, (db) =>
      new ScoreQuarterService(db).generateQuarterlyScore({
        organization_id: auth.organizationId,
        target_user_id: body.target_user_id,
        quarter: body.quarter,
      }),
    );
    return c.json(createSuccessResponse(result));
  });

  app.patch("/rh/score/quarters/nitro", async (c) => {
    const auth = c.get("auth");
    requireRhPermission(auth, RH_MANAGEMENT_PERMISSION);
    const body = parseWithZod(updateNitroBodySchema, await jsonBody(c));
    const result = await deps.withDb(c, (db) =>
      new ScoreQuarterService(db).updateNitro({
        organization_id: auth.organizationId,
        score_id: body.score_id,
        type: body.type,
        value: body.value,
      }),
    );
    return c.json(createSuccessResponse(result));
  });

  // `/me` antes de `/:id`, como no Express.
  app.get("/rh/score/quarters/me", async (c) => {
    const auth = c.get("auth");
    requireRhPermission(auth, RH_SELF_SERVICE_PERMISSION);
    const result = await deps.withDb(c, (db) =>
      new ScoreQuarterService(db).listForUser(auth.organizationId, auth.userId),
    );
    return c.json(createSuccessResponse(result));
  });

  app.get("/rh/score/quarters/:id", async (c) => {
    const auth = c.get("auth");
    requireRhPermission(auth, RH_SELF_SERVICE_PERMISSION);
    const { id } = parseWithZod(scoreQuarterIdParamSchema, c.req.param());
    const result = await deps.withDb(c, (db) =>
      new ScoreQuarterService(db).getDetail({
        organization_id: auth.organizationId,
        score_id: id,
        user_id: auth.userId,
        can_manage: canManageRh(auth),
      }),
    );
    return c.json(createSuccessResponse(result));
  });

  app.put("/rh/score/nitro/update", async (c) => {
    const auth = c.get("auth");
    requireRhPermission(auth, RH_MANAGEMENT_PERMISSION);
    const body = parseWithZod(updateScoreNitroBodySchema, await jsonBody(c));
    const result = await deps.withDb(c, (db) =>
      new ScoreNitroService(db).updateMetric(auth.organizationId, auth.userId, body),
    );
    return c.json(createSuccessResponse(result));
  });

  app.post("/rh/score/nitro/hours/submissions", async (c) => {
    const auth = c.get("auth");
    requireRhPermission(auth, RH_SELF_SERVICE_PERMISSION);
    let form: FormData;
    try {
      form = await parseNitroHoursFormData(c.req.raw);
    } catch (err: unknown) {
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(400, "Upload de certificado inválido.");
    }
    const entryCount = Array.from(form as unknown as Iterable<unknown>).length;
    if (
      entryCount !== 3 ||
      form.getAll("certificate").length !== 1 ||
      form.getAll("quarter").length !== 1 ||
      form.getAll("hours").length !== 1
    ) {
      throw new ServiceError(400, "Envie somente certificado, trimestre e horas.");
    }
    const fileEntry = form.get("certificate");
    if (!(fileEntry instanceof File)) throw new ServiceError(400, "O certificado é obrigatório.");
    if (!(RH_NITRO_HOURS_MIME_TYPES as readonly string[]).includes(fileEntry.type)) {
      throw new ServiceError(400, "Tipo de certificado não permitido. Use PDF, JPEG ou PNG.");
    }
    if (fileEntry.size > 5 * 1024 * 1024)
      throw new ServiceError(413, "O certificado deve ter no máximo 5 MB.");
    const file = {
      buffer: Buffer.from(await fileEntry.arrayBuffer()),
      mimetype: fileEntry.type,
      originalname: fileEntry.name,
    };
    validateUploadFileSignature(file);
    const body = parseWithZod(submitNitroHoursBodySchema, {
      quarter: form.get("quarter"),
      hours: form.get("hours"),
    });
    const result = await deps.withDb(c, (db) =>
      new NitroHoursService(db, nitroHoursStorageFromEnv(deps.env(c))).submit({
        organization_id: auth.organizationId,
        user_id: auth.userId,
        quarter: body.quarter,
        hours: body.hours,
        file: {
          buffer: file.buffer,
          mimetype: file.mimetype as (typeof RH_NITRO_HOURS_MIME_TYPES)[number],
        },
      }),
    );
    return c.json(createSuccessResponse(result), 201);
  });

  app.get("/rh/score/nitro/hours/submissions", async (c) => {
    const auth = c.get("auth");
    requireRhPermission(auth, RH_SELF_SERVICE_PERMISSION);
    const query = parseWithZod(listNitroHoursQuerySchema, {
      quarter: trimmedQuery(c, "quarter"),
      user_id: trimmedQuery(c, "user_id"),
    });
    const result = await deps.withDb(c, (db) =>
      new NitroHoursService(db, nitroHoursStorageFromEnv(deps.env(c))).list({
        organization_id: auth.organizationId,
        user_id: auth.userId,
        can_manage: canManageRh(auth),
        quarter: query.quarter,
        target_user_id: query.user_id,
      }),
    );
    return c.json(createSuccessResponse(result));
  });

  app.get("/rh/score/nitro/hours/summary", async (c) => {
    const auth = c.get("auth");
    requireRhPermission(auth, RH_SELF_SERVICE_PERMISSION);
    const query = parseWithZod(listNitroHoursQuerySchema, {
      quarter: trimmedQuery(c, "quarter"),
      user_id: trimmedQuery(c, "user_id"),
    });
    if (!query.quarter) throw new ServiceError(400, "quarter é obrigatório.");
    const quarter = query.quarter;
    const userId = canManageRh(auth) ? (query.user_id ?? auth.userId) : auth.userId;
    const accepted_hours = await deps.withDb(c, (db) =>
      new NitroHoursService(db, nitroHoursStorageFromEnv(deps.env(c))).acceptedHours({
        organization_id: auth.organizationId,
        quarter,
        user_id: userId,
      }),
    );
    return c.json(
      createSuccessResponse({
        quarter: query.quarter,
        user_id: userId,
        accepted_hours,
        nitro_bonus: accepted_hours >= 10 ? 1 : 0,
      }),
    );
  });

  app.get("/rh/score/nitro/hours/submissions/:id/certificate", async (c) => {
    const auth = c.get("auth");
    requireRhPermission(auth, RH_SELF_SERVICE_PERMISSION);
    const { id } = parseWithZod(nitroHoursIdParamsSchema, c.req.param());
    const result = await deps.withDb(c, (db) =>
      new NitroHoursService(db, nitroHoursStorageFromEnv(deps.env(c))).certificateUrl({
        organization_id: auth.organizationId,
        request_id: id,
        user_id: auth.userId,
        can_manage: canManageRh(auth),
      }),
    );
    return c.json(createSuccessResponse(result));
  });

  app.patch("/rh/score/nitro/hours/submissions/:id/decision", async (c) => {
    const auth = c.get("auth");
    requireRhPermission(auth, RH_MANAGEMENT_PERMISSION);
    const { id } = parseWithZod(nitroHoursIdParamsSchema, c.req.param());
    const body = parseWithZod(decideNitroHoursBodySchema, await jsonBody(c));
    const result = await deps.withDb(c, (db) =>
      new NitroHoursService(db, nitroHoursStorageFromEnv(deps.env(c))).decide({
        organization_id: auth.organizationId,
        request_id: id,
        actor_user_id: auth.userId,
        ...body,
      }),
    );
    return c.json(createSuccessResponse(result));
  });
}
