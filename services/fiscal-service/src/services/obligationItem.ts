import { ServiceError } from "@workspace/shared";

/**
 * Regras de um item de obrigação/declaração, comuns ao controle mensal e ao anual:
 * não aplicável exige motivo; cumprir grava data (não futura) e ator, com protocolo
 * opcional; mudar só o protocolo mantém quem cumpriu; desfazer limpa o cumprimento.
 */
export type ObligationItemStatus = "PENDING" | "COMPLETED" | "NOT_APPLICABLE";

export interface StoredObligationItem {
  applicable: boolean;
  not_applicable_reason: string | null;
  completed_on: Date | null;
  completed_by: string | null;
  protocol: string | null;
}

export interface ObligationItemInput {
  applicable?: boolean;
  completed_on?: string | null;
  protocol?: string;
  reason?: string;
}

export interface ObligationItemEvent {
  action:
    | "OBLIGATION_NOT_APPLICABLE"
    | "OBLIGATION_APPLICABLE"
    | "OBLIGATION_COMPLETED"
    | "OBLIGATION_UNDONE";
  from_value: string | null;
  to_value: string | null;
  reason: string | null;
}

export interface ObligationItemChange {
  data: {
    applicable?: boolean;
    not_applicable_reason?: string | null;
    completed_on?: Date | null;
    completed_by?: string | null;
    protocol?: string | null;
  };
  events: ObligationItemEvent[];
}

export function dateKey(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

export function obligationItemStatus(
  item: Pick<StoredObligationItem, "applicable" | "completed_on">,
): ObligationItemStatus {
  if (!item.applicable) return "NOT_APPLICABLE";
  return item.completed_on ? "COMPLETED" : "PENDING";
}

/** O que gravar e qual trilha registrar; lança ServiceError quando a mudança é inválida. */
export function planObligationItemChange(
  current: StoredObligationItem,
  input: ObligationItemInput,
  actorId: string,
  today: string,
): ObligationItemChange {
  const reason = input.reason ?? null;
  const events: ObligationItemEvent[] = [];
  const data: ObligationItemChange["data"] = {};

  if (input.applicable !== undefined && input.applicable !== current.applicable) {
    if (!input.applicable) {
      if (current.completed_on) {
        throw new ServiceError(409, "Desfaça o cumprimento antes de marcar como não aplicável.");
      }
      if (!reason) throw new ServiceError(400, "Informe o motivo para marcar como não aplicável.");
      data.applicable = false;
      data.not_applicable_reason = reason;
      events.push({
        action: "OBLIGATION_NOT_APPLICABLE",
        from_value: "applicable",
        to_value: "not_applicable",
        reason,
      });
    } else {
      data.applicable = true;
      data.not_applicable_reason = null;
      events.push({
        action: "OBLIGATION_APPLICABLE",
        from_value: "not_applicable",
        to_value: "applicable",
        reason,
      });
    }
  }

  const previousDate = dateKey(current.completed_on);
  if (input.completed_on === null && previousDate) {
    data.completed_on = null;
    data.completed_by = null;
    data.protocol = null;
    events.push({ action: "OBLIGATION_UNDONE", from_value: previousDate, to_value: null, reason });
  } else if (input.completed_on) {
    if (!(data.applicable ?? current.applicable)) {
      throw new ServiceError(409, "Obrigação não aplicável não pode ser cumprida.");
    }
    if (input.completed_on > today) {
      throw new ServiceError(400, "Data de cumprimento no futuro.");
    }
    const protocol = input.protocol === undefined ? current.protocol : input.protocol || null;
    if (input.completed_on !== previousDate || protocol !== current.protocol) {
      data.completed_on = new Date(`${input.completed_on}T00:00:00.000Z`);
      // Só o protocolo mudou: quem cumpriu continua sendo quem cumpriu.
      data.completed_by = input.completed_on === previousDate ? current.completed_by : actorId;
      data.protocol = protocol;
      events.push({
        action: "OBLIGATION_COMPLETED",
        from_value: previousDate,
        to_value: input.completed_on,
        reason,
      });
    }
  }
  return { data, events };
}
