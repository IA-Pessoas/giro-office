export type ReportingPage = {
  rows: readonly Record<string, unknown>[];
  reachedLimit: boolean;
  nextCursor?: string;
};

export function cursorOptions(cursor?: string) {
  return {
    ...(cursor === undefined ? {} : { cursor: { id: cursor }, skip: 1 }),
    orderBy: { id: "asc" as const },
  };
}

export function createReportingPage(
  rows: readonly Record<string, unknown>[],
  limit: number,
): ReportingPage {
  const visibleRows = rows.slice(0, limit);
  const lastId = visibleRows[visibleRows.length - 1]?.id;
  const reachedLimit = rows.length > limit;
  return {
    rows: visibleRows,
    reachedLimit,
    ...(reachedLimit && typeof lastId === "string" ? { nextCursor: lastId } : {}),
  };
}
