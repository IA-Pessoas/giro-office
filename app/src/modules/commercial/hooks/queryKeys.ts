export const commercialQueryKeys = {
  all: ["commercial"] as const,
  overview: () => [...commercialQueryKeys.all, "overview"] as const,
};
