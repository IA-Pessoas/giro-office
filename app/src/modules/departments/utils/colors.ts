export const DEPARTMENT_COLOR_PRESETS = [
  { value: "#2563eb", label: "Azul" },
  { value: "#0f766e", label: "Verde-petróleo" },
  { value: "#059669", label: "Verde" },
  { value: "#ca8a04", label: "Dourado" },
  { value: "#ea580c", label: "Laranja" },
  { value: "#dc2626", label: "Vermelho" },
  { value: "#7c3aed", label: "Roxo" },
  { value: "#475569", label: "Grafite" },
] as const;

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
