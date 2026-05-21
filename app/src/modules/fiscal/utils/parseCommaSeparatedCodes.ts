export function parseCommaSeparatedCodes(value: string): string[] {
  const seen = new Set<string>();
  const normalizedCodes: string[] = [];

  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((item) => {
      if (seen.has(item)) {
        return;
      }

      seen.add(item);
      normalizedCodes.push(item);
    });

  return normalizedCodes;
}
