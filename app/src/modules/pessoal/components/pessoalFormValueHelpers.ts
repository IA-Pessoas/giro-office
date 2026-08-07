import { formatCnpjInput, normalizeDigits } from "../../../shared/utils/inputFormatting.ts";

import type { PessoalUnion, PessoalUnionPayload } from "../types/unions";

export function optional(value: string): string | null;
export function optional<T>(value: string, transform: (value: string) => T | null): T | null;
export function optional<T>(value: string, transform?: (value: string) => T | null): string | T | null {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  return transform ? transform(trimmed) : trimmed;
}

export function finiteNumber(value: string): number | null {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

export function formatPessoalUnionCnpjInput(value: string): string {
  return formatCnpjInput(value);
}

export function normalizePessoalUnionCnpjValue(value: string): string {
  return normalizeDigits(value).slice(0, 14);
}

export function buildPessoalUnionFormValues(union: PessoalUnion | null): {
  name: string;
  cnpj: string;
  base_date: string;
} {
  if (!union) {
    return {
      name: "",
      cnpj: "",
      base_date: "",
    };
  }

  return {
    name: union.name,
    cnpj: formatPessoalUnionCnpjInput(union.cnpj),
    base_date: union.base_date ? union.base_date.slice(0, 10) : "",
  };
}

export function buildPessoalUnionFormPayload(values: {
  name: string;
  cnpj: string;
  base_date: string;
}): PessoalUnionPayload {
  return {
    name: values.name.trim(),
    cnpj: normalizePessoalUnionCnpjValue(values.cnpj),
    base_date: values.base_date || null,
  };
}
