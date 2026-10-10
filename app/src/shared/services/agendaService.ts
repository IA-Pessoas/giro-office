import { setupAPIClient } from "@shared/services/api";

import {
  AGENDA_ENDPOINT,
  type AgendaEvent,
  type AgendaEventPayload,
  type AgendaModule,
} from "./agendaService.contract";

export const agendaService = {
  async list(module: AgendaModule, month: string): Promise<AgendaEvent[]> {
    const response = await setupAPIClient().get(AGENDA_ENDPOINT, { params: { module, month } });
    return (response.data as { data: AgendaEvent[] }).data;
  },
  async create(module: AgendaModule, payload: AgendaEventPayload): Promise<void> {
    await setupAPIClient().post(AGENDA_ENDPOINT, { module, ...payload });
  },
  async update(
    module: AgendaModule,
    agendaId: string,
    payload: Partial<AgendaEventPayload>,
  ): Promise<void> {
    await setupAPIClient().put(AGENDA_ENDPOINT, { module, agenda_id: agendaId, ...payload });
  },
  async remove(module: AgendaModule, agendaId: string): Promise<void> {
    await setupAPIClient().delete(AGENDA_ENDPOINT, { data: { module, agenda_id: agendaId } });
  },
};
