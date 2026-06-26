const TIME_ONLY = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;

/**
 * Converte string "HH:mm", "HH:mm:ss" ou ISO completo em Date (UTC) para campos DateTime do schema.
 */
export function parseTimeToDate(input: string): Date {
  const trimmed = input.trim();
  const match = TIME_ONLY.exec(trimmed);
  if (match) {
    const hours = Number.parseInt(match[1], 10);
    const minutes = Number.parseInt(match[2], 10);
    const seconds = match[3] !== undefined ? Number.parseInt(match[3], 10) : 0;
    if (
      Number.isNaN(hours) ||
      Number.isNaN(minutes) ||
      Number.isNaN(seconds) ||
      hours > 23 ||
      minutes > 59 ||
      seconds > 59
    ) {
      throw new Error("Horário inválido.");
    }
    return new Date(Date.UTC(1970, 0, 1, hours, minutes, seconds, 0));
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Data/hora inválida.");
  }
  return parsed;
}
