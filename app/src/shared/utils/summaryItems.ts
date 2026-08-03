export function getSummaryItems<T>(items: readonly T[], limit: number): {
  items: T[];
  total: number;
  hiddenCount: number;
  hasHiddenItems: boolean;
} {
  const total = items.length;
  const visibleLimit = Math.max(0, limit);
  const hiddenCount = Math.max(0, total - visibleLimit);

  return {
    items: items.slice(0, visibleLimit),
    total,
    hiddenCount,
    hasHiddenItems: hiddenCount > 0,
  };
}
