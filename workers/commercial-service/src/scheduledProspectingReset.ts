import {
  COMMERCIAL_PROSPECTING_EVENT_VERSION,
  COMMERCIAL_PROSPECTING_TRANSITION_EVENT,
} from "@workspace/shared";

type ProspectingResetRow = {
  id: string;
  organization_id: string;
  client_id: string;
  status: string;
  status_date: Date | null;
  description: string | null;
  reset_date: Date;
  reset_scheduled_by: string;
};

type ResetPrisma = {
  commercialProspecting: {
    findFirst(args: Record<string, unknown>): Promise<ProspectingResetRow | null>;
    updateMany(args: Record<string, unknown>): Promise<{ count: number }>;
  };
  commercialProspectingHistory: {
    create(args: Record<string, unknown>): Promise<unknown>;
  };
  commercialOutboxEvent: {
    create(args: Record<string, unknown>): Promise<unknown>;
  };
  $transaction<T>(callback: (tx: ResetPrisma) => Promise<T>): Promise<T>;
};

export type ScheduledProspectingResetOptions = { now?: () => Date };

export function getSaoPauloCalendarDate(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export class ScheduledProspectingResetService {
  private readonly now: () => Date;

  constructor(
    private readonly prisma: ResetPrisma,
    options: ScheduledProspectingResetOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
  }

  async processNext(): Promise<boolean> {
    const now = this.now();
    const dueDate = new Date(`${getSaoPauloCalendarDate(now)}T00:00:00.000Z`);

    return this.prisma.$transaction(async (tx) => {
      const prospecting = await tx.commercialProspecting.findFirst({
        where: {
          reset_date: { lte: dueDate },
          reset_processed_at: null,
          archived_at: null,
        },
        orderBy: [{ reset_date: "asc" }, { id: "asc" }],
        select: {
          id: true,
          organization_id: true,
          client_id: true,
          status: true,
          status_date: true,
          description: true,
          reset_date: true,
          reset_scheduled_by: true,
        },
      });
      if (!prospecting) return false;

      const claimed = await tx.commercialProspecting.updateMany({
        where: {
          id: prospecting.id,
          organization_id: prospecting.organization_id,
          reset_date: prospecting.reset_date,
          reset_processed_at: null,
          archived_at: null,
        },
        data: { status: "Análise/Agendamento", reset_processed_at: now },
      });
      if (claimed.count !== 1) return false;

      const eventId = crypto.randomUUID();
      const payload = {
        event_id: eventId,
        event_type: COMMERCIAL_PROSPECTING_TRANSITION_EVENT,
        event_version: COMMERCIAL_PROSPECTING_EVENT_VERSION,
        organization_id: prospecting.organization_id,
        client_id: prospecting.client_id,
        prospecting_id: prospecting.id,
        from_status: prospecting.status,
        to_status: "Análise/Agendamento",
        status_date: prospecting.status_date?.toISOString() ?? null,
        description: prospecting.description,
        scheduled_reset: true,
        audit_correlation_id: eventId,
        occurred_at: now.toISOString(),
      };

      await tx.commercialOutboxEvent.create({
        data: {
          id: eventId,
          organization_id: prospecting.organization_id,
          aggregate_id: prospecting.id,
          event_type: payload.event_type,
          event_version: payload.event_version,
          payload,
          audit_correlation_id: eventId,
        },
      });
      await tx.commercialProspectingHistory.create({
        data: {
          organization_id: prospecting.organization_id,
          prospecting_id: prospecting.id,
          changed_by: prospecting.reset_scheduled_by,
          field: "status",
          old_value: prospecting.status,
          new_value: "Análise/Agendamento",
          created_at: now,
        },
      });

      return true;
    });
  }
}
