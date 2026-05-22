export function parseCommaSeparatedValues(value: string): string[] {
  const seen = new Set<string>();
  const normalizedValues: string[] = [];

  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((item) => {
      if (seen.has(item)) {
        return;
      }

      seen.add(item);
      normalizedValues.push(item);
    });

  return normalizedValues;
}

export function parseCommaSeparatedCodes(value: string): string[] {
  return parseCommaSeparatedValues(value);
}
