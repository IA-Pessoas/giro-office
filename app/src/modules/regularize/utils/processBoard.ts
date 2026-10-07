import type {
  RegularizeProcessDetail,
  RegularizeProcessListItem,
  UpdateRegularizeProcessPayload,
} from "../types";

export const regularizeProcessStatusOptions = [
  "Pendente",
  "Andamento",
  "Protocolado",
  "Finalizado",
  "Paralisado",
] as const;

export type RegularizeProcessStatus = (typeof regularizeProcessStatusOptions)[number];

export function buildRegularizeProcessStatusUpdatePayload(
  process: RegularizeProcessDetail,
  status: RegularizeProcessStatus,
): UpdateRegularizeProcessPayload {
  return {
    id: process.id,
    client_pj_id: process.client_pj_id ?? undefined,
    client_pf_id: process.client_pf_id ?? undefined,
    cpf_cnpj: process.cpf_cnpj ?? process.clientPF?.cpf ?? process.clientPJ?.cpf_cnpj ?? "",
    process_type: process.process_type,
    description: process.description ?? "",
    entry_date: process.entry_date ?? undefined,
    completion_date: process.completion_date ?? undefined,
    expected_date: process.expected_date ?? undefined,
    client_notice_date: process.client_notice_date,
    status,
    financial_status: process.financial_status ?? undefined,
    observation: process.observation ?? null,
    responsible1_id: process.responsible1_id ?? undefined,
    responsible2_id: process.responsible2_id ?? undefined,
    responsible3_id: process.responsible3_id ?? undefined,
    locking_type: process.locking_type ?? null,
    urgency: process.urgency ?? null,
    task_id: process.task_id ?? undefined,
  };
}

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
