export const commercialQueryKeys = {
  all: ["commercial"] as const,
  prospecting: () => [...commercialQueryKeys.all, "prospecting"] as const,
  taskBillings: () => [...commercialQueryKeys.all, "task-billings"] as const,
};
