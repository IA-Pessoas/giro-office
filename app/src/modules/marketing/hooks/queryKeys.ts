export const marketingQueryKeys = {
  all: ["marketing"] as const,
  dashboard: () => [...marketingQueryKeys.all, "dashboard"] as const,
} as const;
