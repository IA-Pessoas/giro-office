function isValidDate(date: Date) {
  return !Number.isNaN(date.getTime());
}

export function toFiscalInputDate(value: string | null | undefined): string {
  if (!value?.trim()) {
    return "";
  }

  const date = new Date(value);
  if (!isValidDate(date)) {
    return "";
  }

  return date.toISOString().slice(0, 10);
}

export function toFiscalIsoDate(value: string | null | undefined): string | null {
  if (!value?.trim()) {
    return null;
  }

  return new Date(`${value}T00:00:00.000Z`).toISOString();
}

export function formatFiscalDateLabel(value: string | null | undefined): string {
  if (!value?.trim()) {
    return "Não informado";
  }

  const date = new Date(value);
  if (!isValidDate(date)) {
    return "Não informado";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}
