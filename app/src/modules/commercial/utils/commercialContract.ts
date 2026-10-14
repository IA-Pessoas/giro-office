export type CommercialContractDepartments = {
  contabil: boolean;
  fiscal: boolean;
  pessoal: boolean;
  regularize: boolean;
  irpj: boolean;
  tecnologia: boolean;
};

export type CommercialContractDraft = {
  contractDate: string;
  competence: string;
  clientName: string;
  document: string;
  address: string;
  neighborhood: string;
  city: string;
  state: string;
  postalCode: string;
  phone: string;
  email: string;
  representativeName: string;
  representativeDocument: string;
  departments: CommercialContractDepartments;
  percentages: { mei: string; simplesNacional: string; lucroPresumido: string; lucroReal: string };
  serviceStart: string;
  paymentDate: string;
  firstDueDate: string;
  averageRevenue: string;
  averageEmployees: string;
  taxRegime: string;
  banks: string;
};

type ContractClient = {
  status?: string | null;
  prospecting_status?: string | null;
  dominio_code?: string | null;
  name?: string | null;
  company_name?: string | null;
  cpf_cnpj?: string | null;
  address?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  cep?: string | null;
  number?: string | null;
  email?: string | null;
  responsible?: string | null;
  cpf_responsible?: string | null;
  regime?: string | null;
  contabil?: boolean | null;
  fiscal?: boolean | null;
  pessoal?: boolean | null;
  tecnologia?: boolean | null;
};

const INELIGIBLE_INTEGRATION_STATUSES = new Set([
  "Recusado pelo Cliente",
  "Paralisado",
  "Distrato",
]);

export function isCommercialContractEligible(client: ContractClient, isOwner = false): boolean {
  if (client.status === "Inativo") return false;
  if (client.dominio_code) return client.status === "Ativo";
  if (isOwner) return client.prospecting_status === "Fechado";
  return !INELIGIBLE_INTEGRATION_STATUSES.has(client.prospecting_status ?? "");
}

function text(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

export function createCommercialContractDraft(client: ContractClient): CommercialContractDraft {
  return {
    contractDate: "",
    competence: "",
    clientName: text(client.company_name) || text(client.name),
    document: text(client.cpf_cnpj),
    address: text(client.address),
    neighborhood: text(client.neighborhood),
    city: text(client.city),
    state: text(client.state),
    postalCode: text(client.cep),
    phone: text(client.number),
    email: text(client.email),
    representativeName: text(client.responsible),
    representativeDocument: text(client.cpf_responsible),
    departments: {
      contabil: Boolean(client.contabil),
      fiscal: Boolean(client.fiscal),
      pessoal: Boolean(client.pessoal),
      regularize: false,
      irpj: true,
      tecnologia: Boolean(client.tecnologia),
    },
    percentages: { mei: "", simplesNacional: "", lucroPresumido: "", lucroReal: "" },
    serviceStart: "",
    paymentDate: "",
    firstDueDate: "",
    averageRevenue: "",
    averageEmployees: "",
    taxRegime: text(client.regime),
    banks: "",
  };
}

function escapeHtml(value: string): string {
  const entities: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  return value.replace(/[&<>"']/g, (character) => entities[character] ?? character);
}

function formatDate(value: string, long = false): string {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  if (!long) {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(date);
  }
  const parts = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).formatToParts(date);
  const valueByType = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  const month = valueByType.month?.toLocaleUpperCase("pt-BR");
  return `${valueByType.day} de ${month} de ${valueByType.year}`;
}

function formatCompetence(value: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return value;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, 1);
  const month = new Intl.DateTimeFormat("pt-BR", { month: "long" })
    .format(date)
    .toLocaleUpperCase("pt-BR");
  return `${month} de ${match[1]}`;
}

function formatCpfCnpj(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 11) return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (digits.length === 14)
    return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return value;
}

export function renderCommercialContractTemplate(
  draft: CommercialContractDraft,
  template: string,
): string {
  const values: Record<string, string> = {
    contractDate: formatDate(draft.contractDate, true),
    competence: formatCompetence(draft.competence),
    clientName: draft.clientName,
    document: formatCpfCnpj(draft.document),
    address: draft.address,
    neighborhood: draft.neighborhood,
    city: draft.city,
    state: draft.state,
    postalCode: draft.postalCode,
    phone: draft.phone,
    email: draft.email,
    representativeName: draft.representativeName,
    representativeDocument: formatCpfCnpj(draft.representativeDocument),
    signatureClient: `${draft.clientName} CNPJ n° ${formatCpfCnpj(draft.document)}`,
    averageRevenue: draft.averageRevenue,
    averageEmployees: draft.averageEmployees,
    banks: draft.banks,
    taxRegime: draft.taxRegime,
    paymentDate: draft.paymentDate,
    firstDueDate: formatDate(draft.firstDueDate),
    serviceStart: draft.serviceStart,
  };
  const labels = [
    ["mei", "MEI"],
    ["simplesNacional", "Simples Nacional"],
    ["lucroPresumido", "Lucro Presumido"],
    ["lucroReal", "Lucro Real"],
  ] as const;
  const percentages = labels
    .filter(([key]) => text(draft.percentages[key]))
    .map(
      ([key, label]) =>
        `• ${label}: ${escapeHtml(text(draft.percentages[key]))}% do salário mínimo vigente; <br>`,
    )
    .join("");

  return template
    .replace(
      /\{\{check:(contabil|fiscal|pessoal|regularize|irpj|tecnologia):(0|1)\}\}/g,
      (_match, key: keyof CommercialContractDepartments, value: string) =>
        draft.departments[key] === (value === "1") ? "check" : "",
    )
    .replace("{{percentages}}", percentages)
    .replace(/\{\{([A-Za-z]+)\}\}/g, (_match, key: string) => escapeHtml(values[key] ?? ""));
}
