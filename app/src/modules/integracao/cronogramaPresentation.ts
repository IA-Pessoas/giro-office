import { formatCivilDate } from "../../shared/utils/dateFormat.ts";
import type { IntegracaoCronograma } from "./services/cronogramaService";

export function isCronogramaTaskOverdue(previsionDate: string, today: string): boolean {
  return previsionDate.slice(0, 10) < today;
}

export function formatCronogramaText(cronograma: IntegracaoCronograma, today: string): string {
  const clientName = cronograma.client.company_name || cronograma.client.name;
  const lines = cronograma.tasks.map((task) => {
    const overdue = isCronogramaTaskOverdue(task.prevision_date, today) ? " (vencida)" : "";
    return `${formatCivilDate(task.prevision_date)} — ${task.name}${overdue}`;
  });
  return [`Cronograma de Integração — ${clientName}`, ...lines].join("\n");
}
