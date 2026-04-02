import type { Logger } from "@workspace/shared/logger";
import cron from "node-cron";

import type { PrismaClient } from "../generated/prisma/client.js";
import { runCompetenceOutputUpdate } from "./competenceOutputRoutine.js";

interface StartCompetenceOutputCronOptions {
  enabled: boolean;
  logger: Logger;
  prisma: PrismaClient;
}

export function startCompetenceOutputCron({
  enabled,
  logger,
  prisma,
}: StartCompetenceOutputCronOptions): void {
  if (!enabled) {
    return;
  }

  cron.schedule(
    "0 7 * * *",
    () => {
      void runCompetenceOutputUpdate(prisma).catch((err: unknown) => {
        logger.error(
          { event: "competence_output.cron_failed", err },
          "Falha na rotina de competÃªncia",
        );
      });
    },
    { timezone: "America/Sao_Paulo" },
  );

  logger.info(
    { event: "competence_output.cron_enabled" },
    "Cron de competÃªncia ativo (07:00 America/Sao_Paulo)",
  );
}
