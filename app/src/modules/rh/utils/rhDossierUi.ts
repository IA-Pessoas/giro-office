import {
  ADMIN_USER_STATUS_LABELS,
  getAdminUserStatusLabel,
  normalizeAdminUserStatus,
} from "../../users/services/adminUserStatusCatalog.ts";

export const RH_DOSSIER_GENDER_OPTIONS = [
  { value: "F", label: "Feminino" },
  { value: "M", label: "Masculino" },
] as const;

export const RH_DOSSIER_STATUS_OPTIONS = [
  { value: "active", label: ADMIN_USER_STATUS_LABELS.active },
  { value: "inactive", label: ADMIN_USER_STATUS_LABELS.inactive },
] as const;

export function getRhDossierGenderLabel(value: string | null | undefined): string {
  if (value === "F") return "Feminino";
  if (value === "M") return "Masculino";
  return value || "Não informado";
}

export function getRhDossierGenderValue(value: string | null | undefined): string {
  if (value === "F" || value === "Feminino") return "F";
  if (value === "M" || value === "Masculino") return "M";
  return value ?? "";
}

export function getRhDossierStatusLabel(value: string | null | undefined): string {
  return getAdminUserStatusLabel(value) || "Não informado";
}

export function getRhDossierStatusValue(value: string | null | undefined): string {
  return normalizeAdminUserStatus(value) ?? value ?? "";
}
