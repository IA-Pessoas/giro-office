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
import type { ProspectingTaskTransitionDelivery } from "./prospectingTaskTransition.js";
import type { TaskProjectionDelivery } from "./taskProjection.js";

export class CommercialOutboxHttpDelivery implements CommercialOutboxDelivery {
  constructor(
    private readonly clientProjection: ClientProjectionDelivery,
    private readonly taskProjection: TaskProjectionDelivery,
    private readonly taskClose?: ProspectingCloseDelivery,
    private readonly notifications?: Pick<CommercialEmailNotificationService, "notify">,
    private readonly taskTransition?: ProspectingTaskTransitionDelivery,
  ) {}

  async deliver(event: CommercialOutboxEventPayload): Promise<void> {
    if (event.event_type === COMMERCIAL_PROSPECTING_TRANSITION_EVENT) {
      const prospectingEvent = event as CommercialProspectingTransitionEvent;
      const projection = await this.clientProjection.deliver(prospectingEvent);
      if (prospectingEvent.to_status === "Fechado") {
        if (!this.taskClose)
          throw new Error("Dependência de fechamento comercial não configurada.");
        const taskResult = await this.taskClose.deliver(prospectingEvent);
        if (!prospectingEvent.suppress_notice) {
          if (!this.notifications) {
            throw new Error("Dependência de notificação comercial não configurada.");
          }
          await this.notifications.notify(
            prospectingEvent,
            projection.client,
            taskResult.competence,
          );
        }
      } else {
        if (prospectingEvent.from_status === null) return;
        if (!this.taskTransition) {
          throw new Error("Dependência de transição comercial nas tarefas não configurada.");
        }
        await this.taskTransition.deliver(prospectingEvent);
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
