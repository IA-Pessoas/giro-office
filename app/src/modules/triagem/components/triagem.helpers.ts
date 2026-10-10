export function triageUserLabel(
  user: { name: string | null; full_name: string | null } | null,
): string {
  return user?.name || user?.full_name || "Não identificado";
}

// Validação do formulário de catálogo no padrão do app (mensagens em pt-BR), no lugar da
// validação nativa do navegador, que aparece no idioma do sistema.
export function validateTriageCatalogForm(values: {
  code: string;
  label: string;
  url: string;
}): string | null {
  if (!values.code.trim()) return "Informe o código do item.";
  if (!values.label.trim()) return "Informe o rótulo do item.";
  const url = values.url.trim();
  if (url && !/^https:\/\/\S+$/.test(url)) return "A URL deve começar com https://.";
  return null;
}

// "setembro de 2026" → "Setembro de 2026" (a classe CSS capitalize deixaria "Setembro De 2026").
export function formatTriageCompetence(value: string): string {
  const [year, month] = value.split("-").map(Number);
  if (!year || !month) return value;
  const label = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
  return label.charAt(0).toUpperCase() + label.slice(1);
}
