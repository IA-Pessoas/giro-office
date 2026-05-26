import type { ContabilCompetence } from "../types";

export function getCurrentContabilCompetence(date = new Date()): ContabilCompetence {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");

  return `${year}-${month}` as ContabilCompetence;
}
