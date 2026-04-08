import cron from "node-cron";
import type { Logger } from "@workspace/shared/logger";

import type { RegularizeServiceEnv } from "../config/env.js";
import type { RegularizeReconciliationService } from "./regularizeReconciliationService.js";

export function startReconciliationScheduler(
  env: RegularizeServiceEnv,
  logger: Logger,
  reconciliationService: RegularizeReconciliationService,
): void {
  if (!env.enableReconciliationSchedule) {
    return;
  }

  const timezone = env.reconciliationTimezone;

  cron.schedule(
    env.licenseNotificationCron,
    async () => {
      try {
        const result = await reconciliationService.runLicenseNotificationReconciliation();
        logger.info(
          {
            event: "regularize.reconciliation.license.completed",
            data: result,
          },
          "Regularize license reconciliation completed",
        );
      } catch (error) {
        logger.error(
          {
            event: "regularize.reconciliation.license.failed",
            error,
          },
          "Regularize license reconciliation failed",
        );
      }
    },
    { timezone },
  );

  cron.schedule(
    env.clientPfStatusCron,
    async () => {
      try {
        const result = await reconciliationService.runInactiveClientPfStatusReconciliation();
        logger.info(
          {
            event: "regularize.reconciliation.client_pf_status.completed",
            data: result,
          },
          "Regularize client PF status reconciliation completed",
        );
      } catch (error) {
        logger.error(
          {
            event: "regularize.reconciliation.client_pf_status.failed",
            error,
          },
          "Regularize client PF status reconciliation failed",
        );
      }
    },
    { timezone },
  );

  cron.schedule(
    env.clientPfDocumentsCron,
    async () => {
      try {
        const result = await reconciliationService.runClientPfDocumentNotificationReconciliation();
        logger.info(
          {
            event: "regularize.reconciliation.client_pf_documents.completed",
            data: result,
          },
          "Regularize client PF document reconciliation completed",
        );
      } catch (error) {
        logger.error(
          {
            event: "regularize.reconciliation.client_pf_documents.failed",
            error,
          },
          "Regularize client PF document reconciliation failed",
        );
      }
    },
    { timezone },
  );
}
