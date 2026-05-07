import type {
  RhMessageType,
  RhRequestStatus,
  RhRequestUrgency,
} from "../types";

export const RH_REQUEST_STATUS_META: Record<
  RhRequestStatus,
  { label: string; className: string }
> = {
  New: {
    label: "Novo",
    className:
      "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  },
  In_Progress: {
    label: "Em andamento",
    className:
      "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
  },
  Resolved: {
    label: "Resolvido",
    className:
      "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  },
  Closed: {
    label: "Fechado",
    className:
      "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300",
  },
};

export const RH_REQUEST_URGENCY_META: Record<
  RhRequestUrgency,
  { label: string; className: string }
> = {
  Low: {
    label: "Baixa",
    className:
      "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300",
  },
  Medium: {
    label: "Média",
    className:
      "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  },
  High: {
    label: "Alta",
    className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  },
};

export const RH_MESSAGE_TYPE_LABELS: Record<RhMessageType, string> = {
  Message: "Mensagem",
  Solution: "Solução",
  Rejection: "Rejeição",
  Acceptance: "Aceite",
};

export function getRhRequestStatusLabel(status: RhRequestStatus) {
  return RH_REQUEST_STATUS_META[status].label;
}

export function getRhRequestStatusClassName(status: RhRequestStatus) {
  return RH_REQUEST_STATUS_META[status].className;
}

export function getRhRequestUrgencyLabel(urgency: RhRequestUrgency) {
  return RH_REQUEST_URGENCY_META[urgency].label;
}

export function getRhRequestUrgencyClassName(urgency: RhRequestUrgency) {
  return RH_REQUEST_URGENCY_META[urgency].className;
}

export function getRhMessageTypeLabel(type: RhMessageType) {
  return RH_MESSAGE_TYPE_LABELS[type];
}

export function formatRhDate(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleDateString("pt-BR");
}

export function formatRhDateTime(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
