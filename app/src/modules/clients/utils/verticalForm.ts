export function normalizeNullableTextValue(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();

  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeRequiredTextValue(value: string | null | undefined): string {
  return (value ?? "").trim();
}

export function normalizeDateInputValue(value: Date | string | null | undefined): string {
  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (trimmed.length === 0) {
      return "";
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }

    if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) {
      return trimmed.slice(0, 10);
    }

    const parsed = new Date(trimmed);

    return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
  }

  return Number.isNaN(value.getTime()) ? "" : value.toISOString().slice(0, 10);
}

export function normalizeMonthInputValue(value: string | null | undefined): string {
  const trimmed = (value ?? "").trim();

  if (trimmed.length === 0) {
    return "";
  }

  if (/^\d{4}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    return trimmed.slice(0, 7);
  }

  return trimmed;
}
