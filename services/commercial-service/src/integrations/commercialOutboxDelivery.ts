import {
  COMMERCIAL_PROSPECTING_TRANSITION_EVENT,
  COMMERCIAL_TASK_BILLING_UPDATED_EVENT,
  type CommercialProspectingTransitionEvent,
  type CommercialTaskBillingUpdatedEvent,
} from "@workspace/shared";
import type { CommercialEmailNotificationService } from "../services/commercialEmailNotificationService.js";
import type {
  CommercialOutboxDelivery,
  CommercialOutboxEventPayload,
} from "../services/commercialOutboxWorkerService.js";
import type { ClientProjectionDelivery } from "./clientProjection.js";
import type { ProspectingCloseDelivery } from "./prospectingClose.js";
import type { TaskProjectionDelivery } from "./taskProjection.js";

export class CommercialOutboxHttpDelivery implements CommercialOutboxDelivery {
  constructor(
    private readonly clientProjection: ClientProjectionDelivery,
    private readonly taskProjection: TaskProjectionDelivery,
    private readonly taskClose?: ProspectingCloseDelivery,
    private readonly notifications?: Pick<CommercialEmailNotificationService, "notify">,
  ) {}

  async deliver(event: CommercialOutboxEventPayload): Promise<void> {
    if (event.event_type === COMMERCIAL_PROSPECTING_TRANSITION_EVENT) {
      const prospectingEvent = event as CommercialProspectingTransitionEvent;
      const projection = await this.clientProjection.deliver(prospectingEvent);
      if (prospectingEvent.to_status === "Fechado") {
        if (!this.taskClose || !this.notifications) {
          throw new Error("Dependências de fechamento comercial não configuradas.");
        }
        const taskResult = await this.taskClose.deliver(prospectingEvent);
        await this.notifications.notify(prospectingEvent, projection.client, taskResult.competence);
      }
      return;
    }
    if (event.event_type === COMMERCIAL_TASK_BILLING_UPDATED_EVENT) {
      await this.taskProjection.deliver(event as CommercialTaskBillingUpdatedEvent);
      return;
    }
    throw new Error("Tipo de evento comercial não suportado.");
  }
}
