export const commercialQueryKeys = {
  all: ["commercial"] as const,
  dashboard: () => [...commercialQueryKeys.all, "dashboard"] as const,
} as const;
