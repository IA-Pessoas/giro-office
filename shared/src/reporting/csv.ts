// Célula de CSV para abrir em planilha: texto que começa com =, +, -, @, tab ou CR ganha um
// apóstrofo para não virar fórmula (CSV injection) e o valor é citado quando contém o
// separador, aspas ou quebra de linha.
export function csvCell(value: unknown, delimiter = ","): string {
  if (value === null || value === undefined) return "";
  const raw =
    value instanceof Date
      ? value.toISOString()
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);
  const text = typeof value === "string" && /^(\s*[=+\-@]|[\t\r])/u.test(raw) ? `'${raw}` : raw;
  return text.includes(delimiter) || /["\r\n]/u.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function csvLine(values: readonly unknown[], delimiter = ","): string {
  return values.map((value) => csvCell(value, delimiter)).join(delimiter);
}
