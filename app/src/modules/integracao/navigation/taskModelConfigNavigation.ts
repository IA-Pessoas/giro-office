import type { ModuleAccess } from "@modules/auth";

export const TASK_MODEL_CONFIG_ENTRY = {
  href: "/configs/integracao/tasks",
  label: "Modelos de tarefas",
  shortLabel: "Modelos",
  description: "Cadastre e mantenha os modelos usados na criação das tarefas de integração.",
} as const;

export function canViewTaskModelConfig(access?: Pick<ModuleAccess, "canView"> | null): boolean {
  return access?.canView === true;
}

export function canManageTaskModelConfig(access?: Pick<ModuleAccess, "isAdmin"> | null): boolean {
  return access?.isAdmin === true;
}
