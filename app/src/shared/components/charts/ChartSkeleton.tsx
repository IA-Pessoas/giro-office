export function ChartSkeleton({ height = 200 }: { height?: number }) {
  return (
    <div
      className="w-full animate-pulse rounded-md bg-gray-100 dark:bg-gray-800"
      style={{ height }}
      aria-hidden
    />
  );
}
