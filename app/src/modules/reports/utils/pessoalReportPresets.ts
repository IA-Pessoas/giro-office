import type { ReportsCatalogSource } from "../types/report.types";

export interface PessoalReportPreset {
  id:
    | "pessoal-ficha-completa"
    | "pessoal-campos-status"
    | "pessoal-folha-por-grupo"
    | "pessoal-folha-por-sindicato"
    | "pessoal-folha-por-responsavel"
    | "pessoal-folha-por-situacao"
    | "pessoal-obrigacoes-competencia"
    | "pessoal-obrigacoes-responsavel";
  label: string;
  description: string;
  areas: Array<{
    source: string;
    fields: string[];
    filters?: Array<{ field: string; operator: string; value: string }>;
  }>;
}

const presets: readonly PessoalReportPreset[] = [
  {
    id: "pessoal-ficha-completa",
    label: "Ficha completa",
    description: "Configuração atual da folha, com cliente, responsável, sindicato e grupo.",
    areas: [
      {
        source: "pessoal.payroll",
        fields: [
          "client_code",
          "client_name",
          "client_document",
          "client_status",
          "responsible_name",
          "union_name",
          "group_name",
          "group_state",
          "previous",
          "info",
          "contact",
          "advance",
          "advance_type",
          "advance_amount",
          "onvio",
          "vt",
          "vt_value",
          "vt_type",
          "va",
          "assistance_fee",
          "bem_mais",
          "bsf",
          "reinf",
          "employees",
        ],
      },
    ],
  },
  {
    id: "pessoal-campos-status",
    label: "Campos e status",
    description: "Campos permanentes da folha e situações em blocos independentes.",
    areas: [
      {
        source: "pessoal.payroll",
        fields: [
          "client_code",
          "client_name",
          "client_status",
          "responsible_name",
          "union_name",
          "group_name",
          "group_state",
          "previous",
          "advance",
          "onvio",
          "vt",
          "va",
          "assistance_fee",
          "bem_mais",
          "bsf",
          "reinf",
          "employees",
        ],
      },
      {
        source: "pessoal.situations",
        fields: ["status", "title", "registration_date", "completion_date"],
      },
    ],
  },
  ...(
    [
      ["pessoal-folha-por-grupo", "Folha por grupo", "group_name", "o grupo"],
      ["pessoal-folha-por-sindicato", "Folha por sindicato", "union_name", "o sindicato"],
      ["pessoal-folha-por-responsavel", "Folha por responsável", "responsible_name", "o responsável"],
      ["pessoal-folha-por-situacao", "Folha por situação do cliente", "client_status", "a situação"],
    ] as const
  ).map(([id, label, field, subject]) => ({
    id,
    label,
    description: `Clientes com folha filtrados por ${subject}. Informe o valor nos critérios antes de gerar.`,
    areas: [
      {
        source: "pessoal.payroll",
        fields: [
          "client_code",
          "client_name",
          "client_status",
          "responsible_name",
          "union_name",
          "group_name",
          "group_state",
          "employees",
        ],
        filters: [{ field, operator: "eq", value: "" }],
      },
    ],
  })),
  {
    id: "pessoal-obrigacoes-competencia",
    label: "Obrigações por competência",
    description: "Retrato histórico da competência. Informe a competência nos critérios antes de gerar.",
    areas: [
      {
        source: "pessoal.obligations",
        fields: [
          "competence",
          "client_code",
          "client_name",
          "client_status",
          "responsible_name",
          "group_snapshot_name",
          "group_snapshot_policy",
          "group_snapshot_state",
          "advance",
          "payroll",
          "charges",
          "assistance_fee",
          "bem_mais",
          "bsf",
          "va",
          "vt",
        ],
        filters: [{ field: "competence", operator: "eq", value: "" }],
      },
    ],
  },
  {
    id: "pessoal-obrigacoes-responsavel",
    label: "Obrigações por responsável",
    description:
      "Estado de cada item (pendente, concluído ou não possui) na competência. Informe competência e responsável nos critérios.",
    areas: [
      {
        source: "pessoal.obligations",
        fields: [
          "competence",
          "client_code",
          "client_name",
          "responsible_name",
          "group_snapshot_name",
          "advance_state",
          "payroll_state",
          "charges_state",
          "assistance_fee_state",
          "bem_mais_state",
          "bsf_state",
          "va_state",
          "vt_state",
        ],
        filters: [
          { field: "competence", operator: "eq", value: "" },
          { field: "responsible_name", operator: "eq", value: "" },
        ],
      },
    ],
  },
];

function sourceHasFields(source: ReportsCatalogSource | undefined, fields: readonly string[]): boolean {
  const available = new Set(
    source?.fields
      .filter((field) => field.selectable !== false && field.sensitive !== true)
      .map((field) => field.key),
  );
  return fields.every((field) => available.has(field));
}

export function getPessoalReportPresets(
  sources: readonly ReportsCatalogSource[],
): PessoalReportPreset[] {
  return presets.filter((preset) =>
    preset.areas.every((area) =>
      sourceHasFields(
        sources.find((source) => source.key === area.source),
        [...area.fields, ...(area.filters?.map((filter) => filter.field) ?? [])],
      ),
    ),
  );
}
