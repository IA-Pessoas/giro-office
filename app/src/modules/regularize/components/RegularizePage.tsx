import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import {
  Activity,
  ArrowRight,
  BadgeCheck,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Eye,
  FileKey2,
  Landmark,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UserRound,
  UsersRound,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { toast } from "react-toastify";

import { useModuleAccess } from "@modules/auth";
import { useClients } from "@modules/clients";
import { StatusBadge, type StatusBadgeConfig } from "@shared/components/StatusBadge";
import { cn } from "@shared/ui/newLayout/utils";
import { formatCPF_CNPJ } from "@shared/utils/formatters";

import { RegularizeClientPfForm } from "./RegularizeClientPfForm";
import { RegularizeGuidanceActivityForm } from "./RegularizeGuidanceActivityForm";
import { RegularizeGuidanceForm } from "./RegularizeGuidanceForm";
import { RegularizeGuidancePartnerForm } from "./RegularizeGuidancePartnerForm";
import { RegularizeLicenseForm } from "./RegularizeLicenseForm";
import { RegularizeMunicipalTaxesForm } from "./RegularizeMunicipalTaxesForm";
import { RegularizeNativeSelect } from "./RegularizeNativeSelect";
import { RegularizePartnerForm } from "./RegularizePartnerForm";
import { RegularizePasswordForm } from "./RegularizePasswordForm";
import { RegularizeProcessForm } from "./RegularizeProcessForm";
import { RegularizeSitePasswordForm } from "./RegularizeSitePasswordForm";
import {
  useCreateRegularizePasswordMutation,
  useCreateRegularizeSitePasswordMutation,
  useRegularizePasswordDetail,
  useRegularizePasswords,
  useRegularizeSitePasswordDetail,
  useRegularizeSitePasswords,
  useUpdateRegularizePasswordMutation,
  useUpdateRegularizeSitePasswordMutation,
} from "../hooks/useRegularizeCredentials";
import {
  useCreateRegularizeClientPfMutation,
  useCreateRegularizePartnerMutation,
  useRegularizeClientPfDetail,
  useRegularizeClientPfs,
  useRegularizePartners,
  useUpdateRegularizeClientPfMutation,
  useUpdateRegularizePartnerMutation,
} from "../hooks/useRegularizePeople";
import {
  useAddRegularizeGuidanceActivityMutation,
  useAddRegularizeGuidancePartnerMutation,
  useCreateRegularizeGuidanceMutation,
  useCreateRegularizeLicenseMutation,
  useCreateRegularizeMunicipalTaxMutation,
  useCreateRegularizeProcessMutation,
  useRegularizeGuidance,
  useRegularizeLicenseDetail,
  useRegularizeLicenses,
  useRegularizeMunicipalTaxDetail,
  useRegularizeMunicipalTaxes,
  useRegularizeProcessDetail,
  useRegularizeProcesses,
  useRemoveRegularizeGuidanceActivityMutation,
  useRemoveRegularizeGuidancePartnerMutation,
  useUpdateRegularizeGuidanceMutation,
  useUpdateRegularizeLicenseMutation,
  useUpdateRegularizeMunicipalTaxMutation,
  useUpdateRegularizeProcessMutation,
} from "../hooks/useRegularizeOperations";
import type {
  AddRegularizeGuidanceActivityPayload,
  AddRegularizeGuidancePartnerPayload,
  CreateRegularizeClientPfPayload,
  CreateRegularizeGuidancePayload,
  CreateRegularizeLicensePayload,
  CreateRegularizeMunicipalTaxPayload,
  CreateRegularizePartnerPayload,
  CreateRegularizePasswordPayload,
  CreateRegularizeProcessPayload,
  CreateRegularizeSitePasswordPayload,
  RegularizeClientPfListItem,
  RegularizeGuidance,
  RegularizeGuidanceEconomicActivity,
  RegularizeGuidancePartner,
  RegularizeId,
  RegularizeLicenseListItem,
  RegularizeMunicipalTaxesClientSummary,
  RegularizePartner,
  RegularizePasswordListItem,
  RegularizeProcessListItem,
  RegularizeSitePasswordListItem,
  RegularizeStatus,
  UpdateRegularizeClientPfPayload,
  UpdateRegularizeGuidancePayload,
  UpdateRegularizeLicensePayload,
  UpdateRegularizeMunicipalTaxPayload,
  UpdateRegularizePartnerPayload,
  UpdateRegularizePasswordPayload,
  UpdateRegularizeProcessPayload,
  UpdateRegularizeSitePasswordPayload,
} from "../types";
import { getRegularizeMutationErrorMessage } from "../utils/regularizeForm";
import {
  type RegularizeFormOption,
  regularizePrimaryButtonClassName,
} from "./regularizeFormControls";

type RegularizeTabId =
  | "dashboard"
  | "processes"
  | "licenses"
  | "pf"
  | "partners"
  | "passwords"
  | "sites"
  | "taxes";

type RegularizeTab = {
  id: RegularizeTabId;
  label: string;
  icon: LucideIcon;
};

type RegularizeFormState =
  | { type: "client-pf"; mode: "create" }
  | { type: "client-pf"; mode: "edit"; id: RegularizeId }
  | { type: "partner"; mode: "create" }
  | { type: "partner"; mode: "edit"; partner: RegularizePartner }
  | { type: "password"; mode: "create" }
  | { type: "password"; mode: "edit"; id: RegularizeId }
  | { type: "site-password"; mode: "create" }
  | { type: "site-password"; mode: "edit"; id: RegularizeId }
  | { type: "municipal-tax"; mode: "create"; clientId?: RegularizeId }
  | { type: "municipal-tax"; mode: "edit"; id: RegularizeId; clientId?: RegularizeId }
  | { type: "process"; mode: "create" }
  | { type: "process"; mode: "edit"; id: RegularizeId }
  | { type: "guidance"; mode: "create"; processId: RegularizeId }
  | { type: "guidance"; mode: "edit"; guidance: RegularizeGuidance }
  | { type: "guidance-activity"; guidanceId: RegularizeId; processId: RegularizeId }
  | { type: "guidance-partner"; guidanceId: RegularizeId; processId: RegularizeId }
  | { type: "license"; mode: "create" }
  | { type: "license"; mode: "edit"; id: RegularizeId };

type ListQuery<T> = Pick<
  UseQueryResult<T[], Error>,
  "data" | "error" | "isError" | "isFetching" | "isLoading" | "refetch"
>;

const REGULARIZE_TABS: RegularizeTab[] = [
  { id: "dashboard", label: "Dashboard", icon: BarChart3 },
  { id: "processes", label: "Processos", icon: ClipboardList },
  { id: "licenses", label: "Licenças", icon: BadgeCheck },
  { id: "pf", label: "PF", icon: UserRound },
  { id: "partners", label: "Sócios", icon: UsersRound },
  { id: "passwords", label: "Senhas", icon: FileKey2 },
  { id: "sites", label: "Sites", icon: ShieldCheck },
  { id: "taxes", label: "Tributos", icon: Landmark },
];

function normalizeStatus(status: RegularizeStatus | null | undefined): string {
  if (typeof status === "boolean") {
    return status ? "ativo" : "inativo";
  }

  return String(status ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function getStatusBadgeConfig(status: RegularizeStatus | null | undefined): StatusBadgeConfig {
  const normalized = normalizeStatus(status);

  if (typeof status === "boolean") {
    return {
      label: status ? "Ativo" : "Inativo",
      variant: status ? "success" : "neutral",
      icon: status ? CheckCircle2 : XCircle,
    };
  }

  if (normalized === "ativo" || normalized === "concluido") {
    return { label: formatText(status, "Ativo"), variant: "success", icon: CheckCircle2 };
  }

  if (normalized === "inativo" || normalized === "cancelado" || normalized === "encerrado") {
    return { label: formatText(status, "Inativo"), variant: "neutral", icon: XCircle };
  }

  if (normalized === "aberto" || normalized === "em andamento") {
    return { label: formatText(status, "Em andamento"), variant: "info", icon: Activity };
  }

  if (normalized === "pendente" || normalized === "a vencer" || normalized === "urgente") {
    return { label: formatText(status, "Pendente"), variant: "warning", icon: CalendarDays };
  }

  return { label: formatText(status, "Sem status"), variant: "neutral" };
}

function formatText(value: unknown, fallback = "-"): string {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  return String(value);
}

function formatDocument(value: string | null | undefined): string {
  return formatText(formatCPF_CNPJ(value), "-");
}

function formatDocumentDescription(value: string | null | undefined): string | undefined {
  const formatted = formatDocument(value);

  return formatted === "-" ? undefined : formatted;
}

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(date);
}

function getProcessClientName(item: RegularizeProcessListItem): string {
  return item.clientPJ?.name ?? item.clientPF?.name ?? formatDocument(item.cpf_cnpj);
}

function getMunicipalTaxId(item: RegularizeMunicipalTaxesClientSummary): RegularizeId | undefined {
  return item.municipalTaxes?.[0]?.id;
}

function getGuidanceTitle(item: RegularizeGuidance): string {
  return formatText(item.type ?? item.request ?? item.status, "Orientação");
}

function getGuidanceDescription(item: RegularizeGuidance): string {
  return formatText(
    item.description ?? item.framework_obs ?? item.comporate_purpose,
    "Sem descrição.",
  );
}

function formatOptionLabel(label: string, description?: string | null): string {
  return description ? `${label}, ${description}` : label;
}

function TableActionButton({
  disabled,
  icon: Icon,
  onClick,
  title,
}: {
  disabled?: boolean;
  icon: LucideIcon;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-lg",
        "text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900",
        "disabled:cursor-not-allowed disabled:opacity-40",
        "dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white",
      )}
      title={title}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

function TableTextActionButton({
  disabled,
  icon: Icon,
  label,
  onClick,
  title,
}: {
  disabled?: boolean;
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-semibold",
        "border border-blue-500/35 text-blue-600 transition-colors hover:bg-blue-50",
        "disabled:cursor-not-allowed disabled:opacity-40",
        "dark:border-blue-400/35 dark:text-blue-300 dark:hover:bg-blue-500/10",
      )}
      title={title}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span>{label}</span>
    </button>
  );
}

function PrimaryActionButton({
  disabled,
  icon: Icon,
  label,
  onClick,
}: {
  disabled?: boolean;
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={regularizePrimaryButtonClassName}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span>{label}</span>
    </button>
  );
}

function TabActionHeader({
  action,
  description,
  title,
}: {
  action?: ReactNode;
  description: string;
  title: string;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h2 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-white">
          {title}
        </h2>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{description}</p>
      </div>
      {action ? <div className="shrink-0 sm:pb-0.5">{action}</div> : null}
    </div>
  );
}

function DashboardSectionCard({
  actionLabel,
  children,
  description,
  onAction,
  title,
}: {
  actionLabel?: string;
  children: ReactNode;
  description: string;
  onAction?: () => void;
  title: string;
}) {
  return (
    <section className="flex h-full flex-col rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-xl font-semibold tracking-tight text-gray-900 dark:text-white">
            {title}
          </h3>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{description}</p>
        </div>
        {actionLabel && onAction ? (
          <button
            type="button"
            onClick={onAction}
            className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-blue-600 transition-colors hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
          >
            <span>{actionLabel}</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        ) : null}
      </div>
      <div className="flex-1">{children}</div>
    </section>
  );
}

function DashboardHeroCard({
  description,
  icon: Icon,
  label,
  value,
}: {
  description: string;
  icon: LucideIcon;
  label: string;
  value: number | string;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-700 via-blue-600 to-violet-600 p-5 text-white shadow-sm">
      <div className="flex min-h-[180px] items-start justify-between gap-5">
        <div className="min-w-0">
          <p className="text-base font-semibold uppercase tracking-[0.06em] text-white/85">
            {label}
          </p>
          <p className="mt-3 text-4xl font-semibold tracking-tight">{value}</p>
          <p className="mt-3 max-w-md text-sm leading-6 text-white/75">{description}</p>
        </div>
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15 text-white">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function MetricTile({
  icon: Icon,
  label,
  value,
  supporting,
}: {
  icon: LucideIcon;
  label: string;
  value: number | string;
  supporting?: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="flex min-h-[72px] flex-col justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300">
            <Icon className="h-4 w-4" />
          </div>
          <p className="min-w-0 text-sm font-semibold uppercase tracking-[0.04em] text-gray-600 dark:text-gray-300">
            {label}
          </p>
        </div>
        <div className="pl-12">
          <p className="text-[1.4rem] font-semibold tracking-tight text-gray-900 dark:text-white">
            {value}
          </p>
          {supporting ? (
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{supporting}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function QueryStatePanel<T>({
  children,
  emptyClassName,
  emptyTitle,
  query,
}: {
  children: (rows: T[]) => ReactNode;
  emptyClassName?: string;
  emptyTitle: string;
  query: ListQuery<T>;
}) {
  if (query.isLoading) {
    return (
      <div className="flex min-h-32 items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-6 text-sm text-gray-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando dados...
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900/40 dark:bg-red-950/20">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-red-700 dark:text-red-300">
              Não foi possível carregar.
            </p>
            <p className="mt-1 text-sm text-red-600 dark:text-red-300/80">
              {query.error?.message ?? "Tente novamente."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              void query.refetch();
            }}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-red-200 bg-white px-3 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200 dark:hover:bg-red-950/50"
          >
            <RefreshCw className="h-4 w-4" />
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  const rows = query.data ?? [];

  if (rows.length === 0) {
    return (
      <div
        className={cn(
          "flex min-h-32 items-center justify-center rounded-lg border border-gray-200 bg-white px-4 py-8 text-center text-sm text-gray-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400",
          emptyClassName,
        )}
      >
        {emptyTitle}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {query.isFetching ? (
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-slate-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Atualizando...
        </div>
      ) : null}
      {children(rows)}
    </div>
  );
}

function DataTable({
  children,
  headers,
}: {
  children: ReactNode;
  headers: string[];
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-900">
      <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-slate-700">
        <thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-slate-800/60 dark:text-slate-400">
          <tr>
            {headers.map((header) => {
              const shouldCenterHeader = header === "" || header === "Ação";

              return (
                <th
                  key={header}
                  scope="col"
                  className={cn(
                    "px-4 py-3 font-semibold",
                    shouldCenterHeader ? "text-center" : "text-left",
                  )}
                >
                  {header}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-slate-800">{children}</tbody>
      </table>
    </div>
  );
}

function DetailPanel({ children, title }: { children: ReactNode; title: string }) {
  return (
    <aside className="flex h-full min-h-32 flex-col rounded-lg border border-gray-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <h3 className="text-sm font-semibold text-gray-950 dark:text-white">{title}</h3>
      <div className="mt-3 flex flex-1 flex-col space-y-2 text-sm text-gray-600 dark:text-slate-300">
        {children}
      </div>
    </aside>
  );
}

function DetailEmptyState({ message }: { message: string }) {
  return (
    <div className="flex min-h-[120px] flex-1 items-center justify-center text-center text-sm font-medium text-gray-500 dark:text-slate-400">
      {message}
    </div>
  );
}

function FieldLine({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-gray-100 pb-2 last:border-b-0 last:pb-0 dark:border-slate-800">
      <span className="shrink-0 text-xs font-medium uppercase text-gray-500 dark:text-slate-500">
        {label}
      </span>
      <span className="min-w-0 text-right font-medium text-gray-800 dark:text-slate-100">
        {value}
      </span>
    </div>
  );
}

function TabButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-5 py-2.5 font-medium transition-all",
        active
          ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
          : "text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700",
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function MaskedValue() {
  return <span className="font-mono text-gray-500 dark:text-slate-400">********</span>;
}

export function RegularizePage() {
  const [activeTab, setActiveTab] = useState<RegularizeTabId>("dashboard");
  const [selectedClientPfId, setSelectedClientPfId] = useState<RegularizeId>();
  const [selectedCredentialClientId, setSelectedCredentialClientId] = useState<RegularizeId>();
  const [selectedProcessId, setSelectedProcessId] = useState<RegularizeId>();
  const [activePasswordId, setActivePasswordId] = useState<RegularizeId>();
  const [activeSitePasswordId, setActiveSitePasswordId] = useState<RegularizeId>();
  const [activeForm, setActiveForm] = useState<RegularizeFormState | null>(null);

  const currentYear = useMemo(() => new Date().getFullYear(), []);
  const { access: regularizeAccess } = useModuleAccess("regularize");
  const canRevealCredentials = regularizeAccess.canEdit;
  const canManageRegularizeCore = regularizeAccess.canEdit;

  const clientQuery = useClients({ status: "Ativo", page: 1, limit: 100 });
  const pfQuery = useRegularizeClientPfs({ status: "Ativo" });
  const siteQuery = useRegularizeSitePasswords({ status: true });
  const taxQuery = useRegularizeMunicipalTaxes({ year: currentYear });
  const processQuery = useRegularizeProcesses({ status: "Todos" });
  const licenseQuery = useRegularizeLicenses({ status: "Ativo" });

  const createSitePasswordMutation = useCreateRegularizeSitePasswordMutation();
  const updateSitePasswordMutation = useUpdateRegularizeSitePasswordMutation();
  const createPasswordMutation = useCreateRegularizePasswordMutation();
  const updatePasswordMutation = useUpdateRegularizePasswordMutation();
  const createClientPfMutation = useCreateRegularizeClientPfMutation();
  const updateClientPfMutation = useUpdateRegularizeClientPfMutation();
  const createPartnerMutation = useCreateRegularizePartnerMutation();
  const updatePartnerMutation = useUpdateRegularizePartnerMutation();
  const createMunicipalTaxMutation = useCreateRegularizeMunicipalTaxMutation();
  const updateMunicipalTaxMutation = useUpdateRegularizeMunicipalTaxMutation();
  const createProcessMutation = useCreateRegularizeProcessMutation();
  const updateProcessMutation = useUpdateRegularizeProcessMutation();
  const createGuidanceMutation = useCreateRegularizeGuidanceMutation();
  const updateGuidanceMutation = useUpdateRegularizeGuidanceMutation();
  const addGuidanceActivityMutation = useAddRegularizeGuidanceActivityMutation();
  const removeGuidanceActivityMutation = useRemoveRegularizeGuidanceActivityMutation();
  const addGuidancePartnerMutation = useAddRegularizeGuidancePartnerMutation();
  const removeGuidancePartnerMutation = useRemoveRegularizeGuidancePartnerMutation();
  const createLicenseMutation = useCreateRegularizeLicenseMutation();
  const updateLicenseMutation = useUpdateRegularizeLicenseMutation();

  const firstCredentialClientId = clientQuery.data?.items[0]?.id;
  const firstClientPfId = pfQuery.data?.[0]?.id;
  const firstProcessId = processQuery.data?.[0]?.id;
  const currentCredentialClientId = selectedCredentialClientId ?? firstCredentialClientId;
  const currentClientPfId = selectedClientPfId ?? firstClientPfId;
  const currentProcessId = selectedProcessId ?? firstProcessId;

  const partnerQuery = useRegularizePartners(
    currentClientPfId ? { type: "pf", client_id: currentClientPfId } : undefined,
  );
  const credentialQuery = useRegularizePasswords(
    currentCredentialClientId ? { client_id: currentCredentialClientId } : undefined,
  );
  const guidanceQuery = useRegularizeGuidance(
    currentProcessId ? { process_id: currentProcessId } : undefined,
  );
  const clientPfDetailQuery = useRegularizeClientPfDetail(currentClientPfId, {
    enabled: activeTab === "pf",
  });
  const processDetailQuery = useRegularizeProcessDetail(currentProcessId, {
    enabled: activeTab === "processes",
  });
  const isPasswordRevealContextActive =
    activeTab === "passwords" || activeForm?.type === "password";
  const isSitePasswordRevealContextActive =
    activeTab === "sites" || activeForm?.type === "site-password";
  const passwordDetailQuery = useRegularizePasswordDetail(activePasswordId, {
    enabled: canRevealCredentials && isPasswordRevealContextActive,
  });
  const sitePasswordDetailQuery = useRegularizeSitePasswordDetail(activeSitePasswordId, {
    enabled: canRevealCredentials && isSitePasswordRevealContextActive,
  });
  const activeMunicipalTaxId =
    activeForm?.type === "municipal-tax" && activeForm.mode === "edit" ? activeForm.id : undefined;
  const activeLicenseId =
    activeForm?.type === "license" && activeForm.mode === "edit" ? activeForm.id : undefined;
  const municipalTaxDetailQuery = useRegularizeMunicipalTaxDetail(activeMunicipalTaxId, {
    enabled: activeForm?.type === "municipal-tax" && activeForm.mode === "edit",
  });
  const licenseDetailQuery = useRegularizeLicenseDetail(activeLicenseId, {
    enabled: activeForm?.type === "license" && activeForm.mode === "edit",
  });

  useEffect(() => {
    if (!selectedClientPfId && firstClientPfId) {
      setSelectedClientPfId(firstClientPfId);
    }
  }, [firstClientPfId, selectedClientPfId]);

  useEffect(() => {
    if (!selectedCredentialClientId && firstCredentialClientId) {
      setSelectedCredentialClientId(firstCredentialClientId);
    }
  }, [firstCredentialClientId, selectedCredentialClientId]);

  useEffect(() => {
    if (!selectedProcessId && firstProcessId) {
      setSelectedProcessId(firstProcessId);
    }
  }, [firstProcessId, selectedProcessId]);

  const metricData = useMemo(() => {
    const taxRows = taxQuery.data ?? [];
    const processRows = processQuery.data ?? [];
    const completedTaxRows = taxRows.filter((item) => (item.municipalTaxes?.length ?? 0) > 0);
    const openProcessRows = processRows.filter((item) => {
      const normalized = normalizeStatus(item.status);

      return !["cancelado", "concluido", "encerrado"].includes(normalized);
    });

    return {
      activePfs: pfQuery.data?.length ?? 0,
      activeLicenses: licenseQuery.data?.length ?? 0,
      openProcesses: openProcessRows.length,
      processTotal: processRows.length,
      siteTotal: siteQuery.data?.length ?? 0,
      taxesDone: completedTaxRows.length,
      taxesPending: Math.max(taxRows.length - completedTaxRows.length, 0),
      taxesTotal: taxRows.length,
    };
  }, [licenseQuery.data, pfQuery.data, processQuery.data, siteQuery.data, taxQuery.data]);
  const hasProcessRows = (processQuery.data?.length ?? 0) > 0;
  const hasSiteRows = (siteQuery.data?.length ?? 0) > 0;

  const clientOptions = useMemo<RegularizeFormOption[]>(
    () =>
      (clientQuery.data?.items ?? []).map((client) => ({
        id: client.id,
        label: client.name || client.company_name || client.id,
        description: formatDocumentDescription(client.cpf_cnpj),
      })),
    [clientQuery.data],
  );

  const pfOptions = useMemo<RegularizeFormOption[]>(
    () =>
      (pfQuery.data ?? []).map((clientPf) => ({
        id: clientPf.id,
        label: clientPf.name || clientPf.id,
        description: formatDocumentDescription(clientPf.cpf),
      })),
    [pfQuery.data],
  );

  const siteOptions = useMemo<RegularizeFormOption[]>(
    () =>
      (siteQuery.data ?? []).map((site) => ({
        id: site.id,
        label: site.name,
        description: site.sphere,
      })),
    [siteQuery.data],
  );

  const processOptions = useMemo<RegularizeFormOption[]>(
    () =>
      (processQuery.data ?? []).map((process) => ({
        id: process.id,
        label: process.process_type,
        description: getProcessClientName(process),
      })),
    [processQuery.data],
  );

  const activeMunicipalTaxForForm =
    activeForm?.type === "municipal-tax" && activeForm.mode === "edit"
      ? municipalTaxDetailQuery.data ?? null
      : null;
  const activeMunicipalTaxDefaultClientId =
    activeForm?.type === "municipal-tax" ? activeForm.clientId ?? clientOptions[0]?.id ?? "" : "";
  const activeProcessForForm =
    activeForm?.type === "process" && activeForm.mode === "edit"
      ? processDetailQuery.data ?? null
      : null;
  const activeGuidanceForForm =
    activeForm?.type === "guidance" && activeForm.mode === "edit" ? activeForm.guidance : null;
  const activeGuidanceAction =
    activeForm?.type === "guidance-activity" || activeForm?.type === "guidance-partner"
      ? activeForm
      : null;
  const activeLicenseForForm =
    activeForm?.type === "license" && activeForm.mode === "edit"
      ? licenseDetailQuery.data ?? null
      : null;
  const activeClientPfForForm =
    activeForm?.type === "client-pf" && activeForm.mode === "edit"
      ? clientPfDetailQuery.data ?? null
      : null;
  const activePasswordForForm =
    activeForm?.type === "password" && activeForm.mode === "edit"
      ? passwordDetailQuery.data ?? null
      : null;
  const activeSitePasswordForForm =
    activeForm?.type === "site-password" && activeForm.mode === "edit"
      ? sitePasswordDetailQuery.data ?? null
      : null;
  const activePartnerForForm =
    activeForm?.type === "partner" && activeForm.mode === "edit" ? activeForm.partner : null;

  function handleRefreshRegularize() {
    void Promise.all([
      clientQuery.refetch(),
      pfQuery.refetch(),
      siteQuery.refetch(),
      taxQuery.refetch(),
      processQuery.refetch(),
      licenseQuery.refetch(),
      partnerQuery.refetch(),
      credentialQuery.refetch(),
      guidanceQuery.refetch(),
    ]);
  }

  function closeCoreForm() {
    setActiveForm(null);
  }

  async function handleSubmitSitePassword(
    payload: CreateRegularizeSitePasswordPayload | UpdateRegularizeSitePasswordPayload,
  ) {
    try {
      if ("id" in payload) {
        await updateSitePasswordMutation.mutateAsync(payload);
        toast.success("Site atualizado com sucesso.");
      } else {
        await createSitePasswordMutation.mutateAsync(payload);
        toast.success("Site criado com sucesso.");
      }

      setActiveSitePasswordId(undefined);
      closeCoreForm();
    } catch (error) {
      const message = getRegularizeMutationErrorMessage(error, "Não foi possível salvar o site.");
      toast.error(message);
      throw new Error(message);
    }
  }

  async function handleSubmitPassword(
    payload: CreateRegularizePasswordPayload | UpdateRegularizePasswordPayload,
  ) {
    try {
      if ("id" in payload) {
        await updatePasswordMutation.mutateAsync(payload);
        toast.success("Senha atualizada com sucesso.");
      } else {
        await createPasswordMutation.mutateAsync(payload);
        toast.success("Senha criada com sucesso.");
      }

      setSelectedCredentialClientId(payload.client_id);
      setActivePasswordId(undefined);
      closeCoreForm();
    } catch (error) {
      const message = getRegularizeMutationErrorMessage(error, "Não foi possível salvar a senha.");
      toast.error(message);
      throw new Error(message);
    }
  }

  async function handleSubmitClientPf(
    payload: CreateRegularizeClientPfPayload | UpdateRegularizeClientPfPayload,
  ) {
    try {
      const savedClientPf =
        "id" in payload
          ? await updateClientPfMutation.mutateAsync(payload)
          : await createClientPfMutation.mutateAsync(payload);

      setSelectedClientPfId(savedClientPf.id);
      toast.success("Cliente PF salvo com sucesso.");
      closeCoreForm();
    } catch (error) {
      const message = getRegularizeMutationErrorMessage(
        error,
        "Não foi possível salvar o cliente PF.",
      );
      toast.error(message);
      throw new Error(message);
    }
  }

  async function handleSubmitPartner(
    payload: CreateRegularizePartnerPayload | UpdateRegularizePartnerPayload,
  ) {
    try {
      if ("id" in payload) {
        await updatePartnerMutation.mutateAsync(payload);
        toast.success("Sócio atualizado com sucesso.");
      } else {
        await createPartnerMutation.mutateAsync(payload);
        toast.success("Sócio criado com sucesso.");
      }

      setSelectedClientPfId(payload.pf_id);
      closeCoreForm();
    } catch (error) {
      const message = getRegularizeMutationErrorMessage(error, "Não foi possível salvar o sócio.");
      toast.error(message);
      throw new Error(message);
    }
  }

  async function handleSubmitMunicipalTax(
    payload: CreateRegularizeMunicipalTaxPayload | UpdateRegularizeMunicipalTaxPayload,
  ) {
    try {
      if ("id" in payload) {
        await updateMunicipalTaxMutation.mutateAsync(payload);
        toast.success("Tributo atualizado com sucesso.");
      } else {
        await createMunicipalTaxMutation.mutateAsync(payload);
        toast.success("Tributo criado com sucesso.");
      }

      closeCoreForm();
    } catch (error) {
      const message = getRegularizeMutationErrorMessage(
        error,
        "Não foi possível salvar o tributo.",
      );
      toast.error(message);
      throw new Error(message);
    }
  }

  async function handleSubmitProcess(
    payload: CreateRegularizeProcessPayload | UpdateRegularizeProcessPayload,
  ) {
    try {
      const savedProcess =
        "id" in payload
          ? await updateProcessMutation.mutateAsync(payload)
          : await createProcessMutation.mutateAsync(payload);

      setSelectedProcessId(savedProcess.id);
      toast.success("Processo salvo com sucesso.");
      closeCoreForm();
    } catch (error) {
      const message = getRegularizeMutationErrorMessage(
        error,
        "Não foi possível salvar o processo.",
      );
      toast.error(message);
      throw new Error(message);
    }
  }

  async function handleSubmitGuidance(
    payload: CreateRegularizeGuidancePayload | UpdateRegularizeGuidancePayload,
  ) {
    try {
      if ("id" in payload) {
        await updateGuidanceMutation.mutateAsync(payload);
        toast.success("Orientação atualizada com sucesso.");
      } else {
        await createGuidanceMutation.mutateAsync(payload);
        toast.success("Orientação criada com sucesso.");
      }

      closeCoreForm();
    } catch (error) {
      const message = getRegularizeMutationErrorMessage(
        error,
        "Não foi possível salvar a orientação.",
      );
      toast.error(message);
      throw new Error(message);
    }
  }

  async function handleSubmitGuidanceActivity(payload: AddRegularizeGuidanceActivityPayload) {
    try {
      await addGuidanceActivityMutation.mutateAsync(payload);
      toast.success("Atividade adicionada com sucesso.");
      closeCoreForm();
    } catch (error) {
      const message = getRegularizeMutationErrorMessage(
        error,
        "Não foi possível adicionar a atividade.",
      );
      toast.error(message);
      throw new Error(message);
    }
  }

  async function handleRemoveGuidanceActivity(
    guidanceId: RegularizeId,
    processId: RegularizeId,
    itemId: RegularizeId | undefined,
  ) {
    if (!itemId) {
      toast.error("Atividade sem identificador para remoção.");
      return;
    }

    try {
      await removeGuidanceActivityMutation.mutateAsync({
        guidance_id: guidanceId,
        process_id: processId,
        item_id: itemId,
      });
      toast.success("Atividade removida com sucesso.");
    } catch (error) {
      toast.error(
        getRegularizeMutationErrorMessage(error, "Não foi possível remover a atividade."),
      );
    }
  }

  async function handleSubmitGuidancePartner(payload: AddRegularizeGuidancePartnerPayload) {
    try {
      await addGuidancePartnerMutation.mutateAsync(payload);
      toast.success("Sócio adicionado com sucesso.");
      closeCoreForm();
    } catch (error) {
      const message = getRegularizeMutationErrorMessage(
        error,
        "Não foi possível adicionar o sócio.",
      );
      toast.error(message);
      throw new Error(message);
    }
  }

  async function handleRemoveGuidancePartner(
    guidanceId: RegularizeId,
    processId: RegularizeId,
    itemId: RegularizeId | undefined,
  ) {
    if (!itemId) {
      toast.error("Sócio sem identificador para remoção.");
      return;
    }

    try {
      await removeGuidancePartnerMutation.mutateAsync({
        guidance_id: guidanceId,
        process_id: processId,
        item_id: itemId,
      });
      toast.success("Sócio removido com sucesso.");
    } catch (error) {
      toast.error(getRegularizeMutationErrorMessage(error, "Não foi possível remover o sócio."));
    }
  }

  async function handleSubmitLicense(
    payload: CreateRegularizeLicensePayload | UpdateRegularizeLicensePayload,
  ) {
    try {
      if ("id" in payload) {
        await updateLicenseMutation.mutateAsync(payload);
        toast.success("Licença atualizada com sucesso.");
      } else {
        await createLicenseMutation.mutateAsync(payload);
        toast.success("Licença criada com sucesso.");
      }

      closeCoreForm();
    } catch (error) {
      const message = getRegularizeMutationErrorMessage(
        error,
        "Não foi possível salvar a licença.",
      );
      toast.error(message);
      throw new Error(message);
    }
  }

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="mb-1 flex items-center gap-3 text-3xl font-bold text-gray-900 dark:text-white">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-600">
              <ShieldCheck className="h-6 w-6 text-white" />
            </div>
            Regularize
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Processos, licenças, tributos e credenciais em um único fluxo.
          </p>
        </div>

        <button
          type="button"
          onClick={handleRefreshRegularize}
          className="hidden items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 sm:flex"
        >
          <RefreshCw className="h-4 w-4" />
          <span>Atualizar dados</span>
        </button>
      </header>

      <nav
        aria-label="Abas do Regularize"
        className="rounded-xl border border-gray-200 bg-white p-1 dark:border-gray-700 dark:bg-gray-800"
      >
        <div className="overflow-x-auto">
          <div role="tablist" className="flex min-w-max items-center justify-center gap-1 md:min-w-full">
            {REGULARIZE_TABS.map((tab) => (
              <TabButton
                key={tab.id}
                active={activeTab === tab.id}
                icon={tab.icon}
                label={tab.label}
                onClick={() => setActiveTab(tab.id)}
              />
            ))}
          </div>
        </div>
      </nav>

      {activeTab === "dashboard" ? (
        <section className="space-y-5">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)] xl:items-stretch">
            <DashboardHeroCard
              icon={ClipboardList}
              label={
                metricData.openProcesses > 0
                  ? "Processos em acompanhamento"
                  : "Fluxo operacional em dia"
              }
              value={processQuery.isLoading ? "--" : metricData.openProcesses}
              description={
                metricData.openProcesses > 0
                  ? "Processos que ainda exigem acompanhamento, retorno ou conclusão dentro do Regularize."
                  : "Nenhum processo aberto no momento. Novas demandas passam a aparecer aqui quando entrarem no fluxo."
              }
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-1">
              <MetricTile
                icon={BadgeCheck}
                label="Licenças ativas"
                value={licenseQuery.isLoading ? "--" : metricData.activeLicenses}
              />
              <MetricTile
                icon={UserRound}
                label="PF ativos"
                value={pfQuery.isLoading ? "--" : metricData.activePfs}
              />
              <MetricTile
                icon={Landmark}
                label="Tributos pendentes"
                value={taxQuery.isLoading ? "--" : metricData.taxesPending}
                supporting={`${metricData.taxesDone}/${metricData.taxesTotal} criados em ${currentYear}`}
              />
              <MetricTile
                icon={ShieldCheck}
                label="Sites ativos"
                value={siteQuery.isLoading ? "--" : metricData.siteTotal}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:items-stretch">
            <DashboardSectionCard
              title="Processos recentes"
              description="Leitura rápida dos processos carregados no fluxo operacional."
              actionLabel="Ver processos"
              onAction={() => setActiveTab("processes")}
            >
              <QueryStatePanel query={processQuery} emptyTitle="Nenhum processo encontrado.">
                {(processRows) => (
                  <DataTable headers={["Processo", "Cliente", "Documento", "Status"]}>
                    {processRows.slice(0, 6).map((item) => (
                      <tr key={item.id} className="text-gray-700 dark:text-slate-200">
                        <td className="px-4 py-3 font-medium">{formatText(item.process_type)}</td>
                        <td className="px-4 py-3">{getProcessClientName(item)}</td>
                        <td className="px-4 py-3">{formatDocument(item.cpf_cnpj)}</td>
                        <td className="px-4 py-3">
                          <StatusBadge config={getStatusBadgeConfig(item.status)} size="sm" />
                        </td>
                      </tr>
                    ))}
                  </DataTable>
                )}
              </QueryStatePanel>
            </DashboardSectionCard>

            <DashboardSectionCard
              title="Licenças em acompanhamento"
              description="Protocolos ativos e vencimentos que precisam ficar visíveis."
              actionLabel="Ver licenças"
              onAction={() => setActiveTab("licenses")}
            >
              <QueryStatePanel query={licenseQuery} emptyTitle="Nenhuma licença encontrada.">
                {(licenseRows) => (
                  <DataTable headers={["Licença", "Protocolo", "Vencimento"]}>
                    {licenseRows.slice(0, 6).map((item) => (
                      <tr key={item.id} className="text-gray-700 dark:text-slate-200">
                        <td className="px-4 py-3 font-medium">{formatText(item.type_license)}</td>
                        <td className="px-4 py-3">{formatText(item.protocol)}</td>
                        <td className="px-4 py-3">{formatDate(item.due_date)}</td>
                      </tr>
                    ))}
                  </DataTable>
                )}
              </QueryStatePanel>
            </DashboardSectionCard>
          </div>
        </section>
      ) : null}

      {activeTab === "processes" ? (
        <section className="space-y-4">
          <TabActionHeader
            title="Processos"
            description="Acompanhamento operacional dos processos do Regularize."
            action={
              canManageRegularizeCore ? (
                <PrimaryActionButton
                  icon={Plus}
                  label="Novo processo"
                  onClick={() => setActiveForm({ type: "process", mode: "create" })}
                />
              ) : null
            }
          />

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.7fr)]">
            <QueryStatePanel
              query={processQuery}
              emptyTitle="Nenhum processo encontrado."
              emptyClassName="xl:col-span-2 min-h-[220px] items-center justify-center"
            >
              {(processRows) => (
                <DataTable headers={["Processo", "Cliente", "Documento", "Status", ""]}>
                  {processRows.map((item) => (
                    <tr key={item.id} className="text-gray-700 dark:text-slate-200">
                      <td className="px-4 py-3 font-medium">{formatText(item.process_type)}</td>
                      <td className="px-4 py-3">{getProcessClientName(item)}</td>
                      <td className="px-4 py-3">{formatDocument(item.cpf_cnpj)}</td>
                      <td className="px-4 py-3">
                        <StatusBadge config={getStatusBadgeConfig(item.status)} size="sm" />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <TableActionButton
                            icon={Eye}
                            title="Ver detalhe"
                            onClick={() => setSelectedProcessId(item.id)}
                          />
                          {canManageRegularizeCore ? (
                            <TableActionButton
                              icon={Pencil}
                              title="Editar processo"
                              onClick={() => {
                                setSelectedProcessId(item.id);
                                setActiveForm({ type: "process", mode: "edit", id: item.id });
                              }}
                            />
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </DataTable>
              )}
            </QueryStatePanel>

            {hasProcessRows ? (
              <DetailPanel title="Processo selecionado">
                {processDetailQuery.isLoading ? (
                  <FieldLine label="Status" value="Carregando..." />
                ) : processDetailQuery.data ? (
                  <>
                    <FieldLine
                      label="Tipo"
                      value={formatText(processDetailQuery.data.process_type)}
                    />
                    <FieldLine
                      label="Status"
                      value={
                        <StatusBadge
                          config={getStatusBadgeConfig(processDetailQuery.data.status)}
                          size="sm"
                        />
                      }
                    />
                    <FieldLine
                      label="Entrada"
                      value={formatDate(processDetailQuery.data.entry_date)}
                    />
                    <FieldLine
                      label="Previsto"
                      value={formatDate(processDetailQuery.data.expected_date)}
                    />
                    <FieldLine
                      label="Urgência"
                      value={formatText(processDetailQuery.data.urgency)}
                    />
                  </>
                ) : (
                  <FieldLine label="Status" value="Sem seleção." />
                )}

                {canManageRegularizeCore && currentProcessId ? (
                  <div className="pt-2">
                    <PrimaryActionButton
                      icon={Plus}
                      label="Nova orientação"
                      onClick={() =>
                        setActiveForm({ type: "guidance", mode: "create", processId: currentProcessId })
                      }
                    />
                  </div>
                ) : null}

                <div className="pt-2">
                  <QueryStatePanel query={guidanceQuery} emptyTitle="Sem orientações.">
                    {(guidanceRows) => (
                      <div className="space-y-3">
                        {guidanceRows.map((item) => (
                          <div
                            key={item.id}
                            className="rounded-lg border border-gray-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-gray-900 dark:text-white">
                                  {getGuidanceTitle(item)}
                                </p>
                                <p className="mt-1 line-clamp-2 text-sm text-gray-500 dark:text-slate-400">
                                  {getGuidanceDescription(item)}
                                </p>
                              </div>
                              {canManageRegularizeCore ? (
                                <TableActionButton
                                  icon={Pencil}
                                  title="Editar orientação"
                                  onClick={() =>
                                    setActiveForm({ type: "guidance", mode: "edit", guidance: item })
                                  }
                                />
                              ) : null}
                            </div>

                            {canManageRegularizeCore ? (
                              <div className="mt-3 flex flex-wrap gap-2">
                                <PrimaryActionButton
                                  icon={Plus}
                                  label="Adicionar atividade"
                                  onClick={() =>
                                    setActiveForm({
                                      type: "guidance-activity",
                                      guidanceId: item.id,
                                      processId: item.process_id,
                                    })
                                  }
                                />
                                <PrimaryActionButton
                                  icon={Plus}
                                  label="Adicionar sócio"
                                  onClick={() =>
                                    setActiveForm({
                                      type: "guidance-partner",
                                      guidanceId: item.id,
                                      processId: item.process_id,
                                    })
                                  }
                                />
                              </div>
                            ) : null}

                            {(item.economic_activities?.length ?? 0) > 0 ? (
                              <div className="mt-3 space-y-2">
                                <p className="text-xs font-semibold uppercase text-gray-500 dark:text-slate-500">
                                  Atividades
                                </p>
                                {item.economic_activities?.map(
                                  (activity: RegularizeGuidanceEconomicActivity, index) => (
                                    <div
                                      key={activity.id ?? `${activity.code}-${index}`}
                                      className="flex items-start justify-between gap-3 rounded-lg bg-gray-50 px-3 py-2 text-sm dark:bg-slate-800/70"
                                    >
                                      <span className="min-w-0 text-gray-700 dark:text-slate-200">
                                        {formatText(activity.code)} -{" "}
                                        {formatText(activity.description)}
                                      </span>
                                      {canManageRegularizeCore ? (
                                        <TableActionButton
                                          disabled={!activity.id}
                                          icon={Trash2}
                                          title="Remover atividade"
                                          onClick={() => {
                                            void handleRemoveGuidanceActivity(
                                              item.id,
                                              item.process_id,
                                              activity.id,
                                            );
                                          }}
                                        />
                                      ) : null}
                                    </div>
                                  ),
                                )}
                              </div>
                            ) : null}

                            {(item.partners?.length ?? 0) > 0 ? (
                              <div className="mt-3 space-y-2">
                                <p className="text-xs font-semibold uppercase text-gray-500 dark:text-slate-500">
                                  Sócios
                                </p>
                                {item.partners?.map(
                                  (partner: RegularizeGuidancePartner, index) => (
                                    <div
                                      key={partner.id ?? `${partner.name}-${index}`}
                                      className="flex items-start justify-between gap-3 rounded-lg bg-gray-50 px-3 py-2 text-sm dark:bg-slate-800/70"
                                    >
                                      <span className="min-w-0 text-gray-700 dark:text-slate-200">
                                        {formatText(partner.name)} -{" "}
                                        {formatDocument(partner.cpf ?? partner.document)}
                                      </span>
                                      {canManageRegularizeCore ? (
                                        <TableActionButton
                                          disabled={!partner.id}
                                          icon={Trash2}
                                          title="Remover sócio"
                                          onClick={() => {
                                            void handleRemoveGuidancePartner(
                                              item.id,
                                              item.process_id,
                                              partner.id,
                                            );
                                          }}
                                        />
                                      ) : null}
                                    </div>
                                  ),
                                )}
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    )}
                  </QueryStatePanel>
                </div>
              </DetailPanel>
            ) : null}
          </div>
        </section>
      ) : null}

      {activeTab === "licenses" ? (
        <section className="space-y-4">
          <TabActionHeader
            title="Licenças"
            description="Alvarás, licenças e vencimentos vinculados ao fluxo operacional."
            action={
              canManageRegularizeCore ? (
                <PrimaryActionButton
                  icon={Plus}
                  label="Nova licença"
                  onClick={() => setActiveForm({ type: "license", mode: "create" })}
                />
              ) : null
            }
          />

          <QueryStatePanel query={licenseQuery} emptyTitle="Nenhuma licença encontrada.">
            {(licenseRows) => (
              <DataTable headers={["Licença", "Protocolo", "Contato", "Status", "Vencimento", ""]}>
                {licenseRows.map((item: RegularizeLicenseListItem) => (
                  <tr key={item.id} className="text-gray-700 dark:text-slate-200">
                    <td className="px-4 py-3 font-medium">{formatText(item.type_license)}</td>
                    <td className="px-4 py-3">{formatText(item.protocol)}</td>
                    <td className="px-4 py-3">{formatText(item.contact)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge config={getStatusBadgeConfig(item.status)} size="sm" />
                    </td>
                    <td className="px-4 py-3">{formatDate(item.due_date)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end">
                        {canManageRegularizeCore ? (
                          <TableActionButton
                            icon={Pencil}
                            title="Editar licença"
                            onClick={() =>
                              setActiveForm({ type: "license", mode: "edit", id: item.id })
                            }
                          />
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </DataTable>
            )}
          </QueryStatePanel>
        </section>
      ) : null}

      {activeTab === "pf" ? (
        <section className="space-y-4">
          <TabActionHeader
            title="Clientes PF"
            description="Cadastro e manutenção de pessoas físicas usadas no Regularize."
            action={
              canManageRegularizeCore ? (
                <PrimaryActionButton
                  icon={Plus}
                  label="Novo PF"
                  onClick={() => setActiveForm({ type: "client-pf", mode: "create" })}
                />
              ) : null
            }
          />

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]">
            <QueryStatePanel query={pfQuery} emptyTitle="Nenhum cliente PF encontrado.">
              {(pfRows) => (
                <DataTable headers={["Código", "Nome", "CPF", ""]}>
                  {pfRows.map((item: RegularizeClientPfListItem) => (
                    <tr key={item.id} className="text-gray-700 dark:text-slate-200">
                      <td className="px-4 py-3">{formatText(item.code)}</td>
                      <td className="px-4 py-3 font-medium">{formatText(item.name)}</td>
                      <td className="px-4 py-3">{formatDocument(item.cpf)}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <TableActionButton
                            icon={Eye}
                            title="Ver detalhe"
                            onClick={() => setSelectedClientPfId(item.id)}
                          />
                          {canManageRegularizeCore ? (
                            <TableActionButton
                              icon={Pencil}
                              title="Editar cliente PF"
                              onClick={() => {
                                setSelectedClientPfId(item.id);
                                setActiveForm({ type: "client-pf", mode: "edit", id: item.id });
                              }}
                            />
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </DataTable>
              )}
            </QueryStatePanel>

            <DetailPanel title="Cliente PF selecionado">
              {clientPfDetailQuery.isLoading ? (
                <FieldLine label="Status" value="Carregando..." />
              ) : clientPfDetailQuery.data ? (
                <>
                  <FieldLine label="Nome" value={formatText(clientPfDetailQuery.data.name)} />
                  <FieldLine label="CPF" value={formatDocument(clientPfDetailQuery.data.cpf)} />
                  <FieldLine label="Cidade" value={formatText(clientPfDetailQuery.data.city)} />
                  <FieldLine label="UF" value={formatText(clientPfDetailQuery.data.state)} />
                  <FieldLine label="Status" value={formatText(clientPfDetailQuery.data.status)} />
                </>
              ) : (
                <FieldLine label="Status" value="Sem seleção." />
              )}
            </DetailPanel>
          </div>
        </section>
      ) : null}

      {activeTab === "partners" ? (
        <section className="space-y-4">
          <TabActionHeader
            title="Sócios"
            description="Quadro societário vinculado aos clientes PF e PJ do Regularize."
            action={
              canManageRegularizeCore ? (
                <PrimaryActionButton
                  icon={Plus}
                  label="Novo sócio"
                  onClick={() => setActiveForm({ type: "partner", mode: "create" })}
                />
              ) : null
            }
          />

          <QueryStatePanel query={partnerQuery} emptyTitle="Nenhum sócio encontrado.">
            {(partnerRows) => (
              <DataTable headers={["PF", "PJ", "Participação", "Entrada", "Saída", ""]}>
                {partnerRows.map((item: RegularizePartner) => (
                  <tr key={item.id} className="text-gray-700 dark:text-slate-200">
                    <td className="px-4 py-3 font-medium">{formatText(item.pf_id).slice(0, 8)}</td>
                    <td className="px-4 py-3">{formatText(item.pj_id).slice(0, 8)}</td>
                    <td className="px-4 py-3">{formatText(item.part)}</td>
                    <td className="px-4 py-3">{formatDate(item.entry)}</td>
                    <td className="px-4 py-3">{formatDate(item.exit)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end">
                        {canManageRegularizeCore ? (
                          <TableActionButton
                            icon={Pencil}
                            title="Editar sócio"
                            onClick={() =>
                              setActiveForm({ type: "partner", mode: "edit", partner: item })
                            }
                          />
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </DataTable>
            )}
          </QueryStatePanel>
        </section>
      ) : null}

      {activeTab === "passwords" ? (
        <section className="space-y-4">
          <TabActionHeader
            title="Senhas por cliente"
            description="Credenciais vinculadas ao cliente selecionado, com reveal explícito."
            action={
              canManageRegularizeCore ? (
                <PrimaryActionButton
                  icon={Plus}
                  label="Nova senha"
                  onClick={() => setActiveForm({ type: "password", mode: "create" })}
                />
              ) : null
            }
          />

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)] xl:items-stretch">
            <div className="space-y-3">
              <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                <label className="flex w-full flex-col gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <span>Cliente</span>
                  <RegularizeNativeSelect
                    value={currentCredentialClientId ?? ""}
                    onChange={(event) => setSelectedCredentialClientId(event.target.value)}
                  >
                    <option value="">Selecione</option>
                    {clientOptions.map((client) => (
                      <option key={client.id} value={client.id}>
                        {formatOptionLabel(client.label, client.description)}
                      </option>
                    ))}
                  </RegularizeNativeSelect>
                </label>
              </div>

              <QueryStatePanel
                query={credentialQuery}
                emptyTitle="Nenhuma senha encontrada."
                emptyClassName="min-h-24 py-5"
              >
                {(credentialRows) => (
                  <DataTable headers={["Site", "Escopo", "Observação", "Senha", ""]}>
                    {credentialRows.map((item: RegularizePasswordListItem) => (
                      <tr key={item.id} className="text-gray-700 dark:text-slate-200">
                        <td className="px-4 py-3 font-medium">{formatText(item.site?.name)}</td>
                        <td className="px-4 py-3">{formatText(item.site?.sphere)}</td>
                        <td className="px-4 py-3">{formatText(item.notes)}</td>
                        <td className="px-4 py-3">
                          <MaskedValue />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1">
                            <TableActionButton
                              disabled={!canRevealCredentials}
                              icon={Eye}
                              title="Revelar senha"
                              onClick={() => setActivePasswordId(item.id)}
                            />
                            {canManageRegularizeCore ? (
                              <TableActionButton
                                disabled={!canRevealCredentials}
                                icon={Pencil}
                                title="Editar senha"
                                onClick={() => {
                                  setActivePasswordId(item.id);
                                  setActiveForm({ type: "password", mode: "edit", id: item.id });
                                }}
                              />
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </DataTable>
                )}
              </QueryStatePanel>
            </div>

            <DetailPanel title="Senha selecionada">
              {passwordDetailQuery.isLoading ? (
                <FieldLine label="Status" value="Carregando..." />
              ) : passwordDetailQuery.isError ? (
                <FieldLine label="Status" value="Acesso negado ou indisponível." />
              ) : passwordDetailQuery.data ? (
                <>
                  <FieldLine label="Login" value={formatText(passwordDetailQuery.data.login)} />
                  <FieldLine label="Senha" value={formatText(passwordDetailQuery.data.password)} />
                  <FieldLine label="Notas" value={formatText(passwordDetailQuery.data.notes)} />
                </>
              ) : (
                <DetailEmptyState message="Sem revelação ativa." />
              )}
            </DetailPanel>
          </div>
        </section>
      ) : null}

      {activeTab === "sites" ? (
        <section className="space-y-4">
          <TabActionHeader
            title="Sites base"
            description="Portais e credenciais base usados para compor as senhas por cliente."
            action={
              canManageRegularizeCore ? (
                <PrimaryActionButton
                  icon={Plus}
                  label="Novo site"
                  onClick={() => setActiveForm({ type: "site-password", mode: "create" })}
                />
              ) : null
            }
          />

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)] xl:items-stretch">
            <QueryStatePanel
              query={siteQuery}
              emptyTitle="Nenhum site encontrado."
              emptyClassName="xl:col-span-2"
            >
              {(siteRows) => (
                <DataTable headers={["Site", "Escopo", "Usuário", "Status", ""]}>
                  {siteRows.map((item: RegularizeSitePasswordListItem) => (
                    <tr key={item.id} className="text-gray-700 dark:text-slate-200">
                      <td className="px-4 py-3 font-medium">{formatText(item.name)}</td>
                      <td className="px-4 py-3">{formatText(item.sphere)}</td>
                      <td className="px-4 py-3">{formatText(item.user)}</td>
                      <td className="px-4 py-3">
                        <StatusBadge config={getStatusBadgeConfig(item.status)} size="sm" />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <TableActionButton
                            disabled={!canRevealCredentials}
                            icon={Eye}
                            title="Revelar credencial"
                            onClick={() => setActiveSitePasswordId(item.id)}
                          />
                          {canManageRegularizeCore ? (
                            <TableActionButton
                              disabled={!canRevealCredentials}
                              icon={Pencil}
                              title="Editar site"
                              onClick={() => {
                                setActiveSitePasswordId(item.id);
                                setActiveForm({
                                  type: "site-password",
                                  mode: "edit",
                                  id: item.id,
                                });
                              }}
                            />
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </DataTable>
              )}
            </QueryStatePanel>

            {hasSiteRows ? (
              <DetailPanel title="Site selecionado">
                {sitePasswordDetailQuery.isLoading ? (
                  <FieldLine label="Status" value="Carregando..." />
                ) : sitePasswordDetailQuery.isError ? (
                  <FieldLine label="Status" value="Acesso negado ou indisponível." />
                ) : sitePasswordDetailQuery.data ? (
                  <>
                    <FieldLine
                      label="Usuário"
                      value={formatText(sitePasswordDetailQuery.data.user)}
                    />
                    <FieldLine
                      label="Senha"
                      value={formatText(sitePasswordDetailQuery.data.password)}
                    />
                    <FieldLine label="Link" value={formatText(sitePasswordDetailQuery.data.link)} />
                  </>
                ) : (
                  <DetailEmptyState message="Sem revelação ativa." />
                )}
              </DetailPanel>
            ) : null}
          </div>
        </section>
      ) : null}

      {activeTab === "taxes" ? (
        <section className="space-y-4">
          <TabActionHeader
            title="Tributos municipais"
            description={`Controle de TFF, TLP e TLL para ${currentYear}.`}
            action={
              canManageRegularizeCore ? (
                <PrimaryActionButton
                  icon={Plus}
                  label="Novo tributo"
                  onClick={() =>
                    setActiveForm({
                      type: "municipal-tax",
                      mode: "create",
                      clientId: clientOptions[0]?.id,
                    })
                  }
                />
              ) : null
            }
          />

          <QueryStatePanel query={taxQuery} emptyTitle="Nenhum tributo encontrado.">
            {(taxRows) => (
              <DataTable headers={["Cliente", "Documento", "Cidade", "Ano", "Registro", "Ação"]}>
                {taxRows.map((item: RegularizeMunicipalTaxesClientSummary) => {
                  const municipalTaxId = getMunicipalTaxId(item);

                  return (
                    <tr key={item.id} className="text-gray-700 dark:text-slate-200">
                      <td className="px-4 py-3 font-medium">{formatText(item.name)}</td>
                      <td className="px-4 py-3">{formatDocument(item.cpf_cnpj)}</td>
                      <td className="px-4 py-3">
                        {item.city ? (
                          formatText(item.city)
                        ) : (
                          <span className="block text-center text-gray-500 dark:text-slate-400">
                            -
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">{currentYear}</td>
                      <td className="px-4 py-3">
                        <StatusBadge
                          config={
                            municipalTaxId
                              ? { label: "Criado", variant: "success", icon: CheckCircle2 }
                              : { label: "Pendente", variant: "warning", icon: CalendarDays }
                          }
                          size="sm"
                        />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex justify-center">
                          {canManageRegularizeCore ? (
                            <TableTextActionButton
                              icon={Pencil}
                              title="Editar tributo"
                              label="Editar"
                              onClick={() =>
                                setActiveForm(
                                  municipalTaxId
                                    ? {
                                        type: "municipal-tax",
                                        mode: "edit",
                                        id: municipalTaxId,
                                        clientId: item.id,
                                      }
                                    : {
                                        type: "municipal-tax",
                                        mode: "create",
                                        clientId: item.id,
                                      },
                                )
                              }
                            />
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </DataTable>
            )}
          </QueryStatePanel>
        </section>
      ) : null}

      <RegularizeClientPfForm
        open={activeForm?.type === "client-pf"}
        mode={activeForm?.type === "client-pf" ? activeForm.mode : "create"}
        clientPf={activeClientPfForForm}
        isLoadingInitialValue={
          activeForm?.type === "client-pf" &&
          activeForm.mode === "edit" &&
          clientPfDetailQuery.isLoading
        }
        isSubmitting={createClientPfMutation.isPending || updateClientPfMutation.isPending}
        onClose={closeCoreForm}
        onSubmit={handleSubmitClientPf}
      />

      <RegularizePartnerForm
        open={activeForm?.type === "partner"}
        partner={activePartnerForForm}
        defaultPfId={currentClientPfId ?? ""}
        clientOptions={clientOptions}
        pfOptions={pfOptions}
        isSubmitting={createPartnerMutation.isPending || updatePartnerMutation.isPending}
        onClose={closeCoreForm}
        onSubmit={handleSubmitPartner}
      />

      <RegularizePasswordForm
        open={activeForm?.type === "password"}
        mode={activeForm?.type === "password" ? activeForm.mode : "create"}
        password={activePasswordForForm}
        defaultClientId={currentCredentialClientId ?? ""}
        clientOptions={clientOptions}
        siteOptions={siteOptions}
        isLoadingInitialValue={
          activeForm?.type === "password" &&
          activeForm.mode === "edit" &&
          passwordDetailQuery.isLoading
        }
        isSubmitting={createPasswordMutation.isPending || updatePasswordMutation.isPending}
        onClose={closeCoreForm}
        onSubmit={handleSubmitPassword}
      />

      <RegularizeSitePasswordForm
        open={activeForm?.type === "site-password"}
        mode={activeForm?.type === "site-password" ? activeForm.mode : "create"}
        sitePassword={activeSitePasswordForForm}
        isLoadingInitialValue={
          activeForm?.type === "site-password" &&
          activeForm.mode === "edit" &&
          sitePasswordDetailQuery.isLoading
        }
        isSubmitting={createSitePasswordMutation.isPending || updateSitePasswordMutation.isPending}
        onClose={closeCoreForm}
        onSubmit={handleSubmitSitePassword}
      />

      <RegularizeMunicipalTaxesForm
        open={activeForm?.type === "municipal-tax"}
        mode={activeForm?.type === "municipal-tax" ? activeForm.mode : "create"}
        municipalTax={activeMunicipalTaxForForm}
        defaultClientId={activeMunicipalTaxDefaultClientId}
        clientOptions={clientOptions}
        currentYear={currentYear}
        isLoadingInitialValue={
          activeForm?.type === "municipal-tax" &&
          activeForm.mode === "edit" &&
          municipalTaxDetailQuery.isLoading
        }
        isSubmitting={createMunicipalTaxMutation.isPending || updateMunicipalTaxMutation.isPending}
        onClose={closeCoreForm}
        onSubmit={handleSubmitMunicipalTax}
      />

      <RegularizeProcessForm
        open={activeForm?.type === "process"}
        mode={activeForm?.type === "process" ? activeForm.mode : "create"}
        process={activeProcessForForm}
        defaultClientId={clientOptions[0]?.id ?? ""}
        clientOptions={clientOptions}
        pfOptions={pfOptions}
        isLoadingInitialValue={
          activeForm?.type === "process" &&
          activeForm.mode === "edit" &&
          processDetailQuery.isLoading
        }
        isSubmitting={createProcessMutation.isPending || updateProcessMutation.isPending}
        onClose={closeCoreForm}
        onSubmit={handleSubmitProcess}
      />

      <RegularizeGuidanceForm
        open={activeForm?.type === "guidance"}
        mode={activeForm?.type === "guidance" ? activeForm.mode : "create"}
        guidance={activeGuidanceForForm}
        defaultProcessId={
          activeForm?.type === "guidance" && activeForm.mode === "create"
            ? activeForm.processId
            : currentProcessId ?? ""
        }
        processOptions={processOptions}
        isSubmitting={createGuidanceMutation.isPending || updateGuidanceMutation.isPending}
        onClose={closeCoreForm}
        onSubmit={handleSubmitGuidance}
      />

      <RegularizeGuidanceActivityForm
        open={activeForm?.type === "guidance-activity"}
        guidanceId={activeGuidanceAction?.guidanceId}
        processId={activeGuidanceAction?.processId}
        isSubmitting={addGuidanceActivityMutation.isPending}
        onClose={closeCoreForm}
        onSubmit={handleSubmitGuidanceActivity}
      />

      <RegularizeGuidancePartnerForm
        open={activeForm?.type === "guidance-partner"}
        guidanceId={activeGuidanceAction?.guidanceId}
        processId={activeGuidanceAction?.processId}
        isSubmitting={addGuidancePartnerMutation.isPending}
        onClose={closeCoreForm}
        onSubmit={handleSubmitGuidancePartner}
      />

      <RegularizeLicenseForm
        open={activeForm?.type === "license"}
        mode={activeForm?.type === "license" ? activeForm.mode : "create"}
        license={activeLicenseForForm}
        defaultClientId={clientOptions[0]?.id ?? ""}
        clientOptions={clientOptions}
        isLoadingInitialValue={
          activeForm?.type === "license" &&
          activeForm.mode === "edit" &&
          licenseDetailQuery.isLoading
        }
        isSubmitting={createLicenseMutation.isPending || updateLicenseMutation.isPending}
        onClose={closeCoreForm}
        onSubmit={handleSubmitLicense}
      />
    </div>
  );
}
