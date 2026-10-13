export const commercialQueryKeys = {
  all: ["commercial"] as const,
  prospecting: (filters?: unknown) => filters
    ? [...commercialQueryKeys.all, "prospecting", filters] as const
    : [...commercialQueryKeys.all, "prospecting"] as const,
  prospectingClients: () => [...commercialQueryKeys.all, "prospecting-clients"] as const,
  taskBillings: () => [...commercialQueryKeys.all, "task-billings"] as const,
};
