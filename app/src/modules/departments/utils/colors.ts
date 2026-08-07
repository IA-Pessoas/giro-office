export const DEPARTMENT_COLOR_PRESETS = [
  { value: "#2563eb", label: "Azul" },
  { value: "#059669", label: "Verde" },
  { value: "#facc15", label: "Amarelo" },
  { value: "#f97316", label: "Laranja" },
  { value: "#dc2626", label: "Vermelho" },
  { value: "#7c3aed", label: "Roxo" },
  { value: "#111827", label: "Preto" },
  { value: "#475569", label: "Grafite" },
  { value: "#06b6d4", label: "Ciano" },
  { value: "#14b8a6", label: "Turquesa" },
  { value: "#84cc16", label: "Lima" },
  { value: "#ea580c", label: "Laranja escuro" },
  { value: "#ec4899", label: "Rosa" },
  { value: "#4f46e5", label: "Indigo" },
  { value: "#64748b", label: "Cinza" },
  { value: "#000000", label: "Preto" },
  { value: "#0f766e", label: "Verde-petroleo" },
  { value: "#8b5cf6", label: "Lavanda" },
  { value: "#f43f5e", label: "Carmim" },
  { value: "#94a3b8", label: "Cinza claro" },
] as const;

export const DEPARTMENT_PRIMARY_COLOR_COUNT = 8;

function normalizeColor(color: string): string {
  return color.trim().toLowerCase();
}

export function getDepartmentColorLabel(color: string): string {
  const normalizedColor = normalizeColor(color);
  const preset = DEPARTMENT_COLOR_PRESETS.find(
    (item) => normalizeColor(item.value) === normalizedColor,
  );

  return preset?.label ?? "Personalizada";
}

export function isDepartmentPresetColor(color: string): boolean {
  const normalizedColor = normalizeColor(color);

  return DEPARTMENT_COLOR_PRESETS.some((item) => normalizeColor(item.value) === normalizedColor);
}
