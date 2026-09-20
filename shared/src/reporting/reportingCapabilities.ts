export function reportingAggregations(
  type: string,
): readonly ("count" | "sum" | "avg" | "min" | "max")[] {
  return type === "number"
    ? ["count", "sum", "avg", "min", "max"]
    : type === "boolean"
      ? ["count"]
      : ["count", "min", "max"];
}
