import type { RegularizeProcessListItem } from "../types";

export const regularizeProcessStatusOptions = [
  "Pendente",
  "Andamento",
  "Protocolado",
  "Finalizado",
  "Paralisado",
] as const;

export type RegularizeProcessBoardColumn = {
  status: string;
  label: string;
  items: RegularizeProcessListItem[];
};

const PROCESS_STATUS_ALIASES: Record<
  (typeof regularizeProcessStatusOptions)[number],
  string[]
> = {
  Pendente: ["pendente"],
  Andamento: ["andamento", "aberto", "em andamento"],
  Protocolado: ["protocolado"],
  Finalizado: ["finalizado", "concluido"],
  Paralisado: ["paralisado", "paralizado"],
};

function normalizeProcessStatus(status: string): string {
  return status
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function getCanonicalProcessStatus(status: string): string | undefined {
  const normalizedStatus = normalizeProcessStatus(status);

  return regularizeProcessStatusOptions.find((canonicalStatus) =>
    PROCESS_STATUS_ALIASES[canonicalStatus].includes(normalizedStatus),
  );
}

export function groupRegularizeProcessesByStatus(
  items: RegularizeProcessListItem[],
): RegularizeProcessBoardColumn[] {
  const columns: RegularizeProcessBoardColumn[] = regularizeProcessStatusOptions.map(
    (status) => ({
      status,
      label: status === "Andamento" ? "Em andamento" : status,
      items: [],
    }),
  );
  const columnsByStatus = new Map<string, RegularizeProcessBoardColumn>(
    columns.map((column) => [column.status, column]),
  );
  const otherItems: RegularizeProcessListItem[] = [];

  for (const item of items) {
    const status = getCanonicalProcessStatus(item.status);
    const column = status ? columnsByStatus.get(status) : undefined;

    if (column) {
      column.items.push(item);
    } else {
      otherItems.push(item);
    }
  }

  if (otherItems.length > 0) {
    columns.push({ status: "Outros", label: "Outros status", items: otherItems });
  }

  return columns;
}
