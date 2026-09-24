import { submitScoreEvaluationBodySchema } from "@workspace/rh-service/src/schemas/scoreEvaluation.schemas.js";
import { updateScoreNitroBodySchema } from "@workspace/rh-service/src/schemas/scoreNitro.schemas.js";
import {
  generateQuarterBodySchema,
  scoreQuarterIdParamSchema,
  updateNitroBodySchema,
} from "@workspace/rh-service/src/schemas/scoreQuarter.schemas.js";
import { parseWithZod } from "@workspace/shared";
import { createSuccessResponse } from "@workspace/shared/http";
import { requireRhPermission } from "../auth.js";
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
} from "./shared.js";

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
}
