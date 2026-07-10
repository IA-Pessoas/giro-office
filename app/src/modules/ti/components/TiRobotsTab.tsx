import { useMemo, useState, type FormEvent, type KeyboardEvent, type MouseEvent } from "react";
import {
  Bot,
  CheckCircle2,
  Clock3,
  Eye,
  History,
  Loader2,
  Pencil,
  PlayCircle,
  Plus,
  RefreshCw,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";

import { Dialog } from "@shared/components";
import { cn } from "@shared/ui/newLayout/utils";

import {
  useCreateTiRobot,
  useCreateTiRobotRun,
  useTiRobot,
  useTiRobotRuns,
  useTiRobots,
  useUpdateTiRobot,
} from "../hooks";
import type {
  TiId,
  TiListFilters,
  TiRobot,
  TiRobotPayload,
  TiRobotRun,
  TiRobotRunPayload,
  TiRobotType,
} from "../types";
import { TiNativeSelect } from "./TiNativeSelect";
import { TiEmptyState, TiIconAction, TiPanel, TiSectionHeader } from "./tiFormControls";
import {
  tiInputClassName,
  tiLabelClassName,
  tiPrimaryButtonClassName,
  tiSecondaryButtonClassName,
  tiThinScrollbarClassName,
} from "./tiWorkspaceUi";

const ROBOT_STATUS_OPTIONS = [
  { value: "", label: "Todos os status" },
  { value: "active", label: "Ativo" },
  { value: "inactive", label: "Inativo" },
  { value: "running", label: "Em execução" },
  { value: "failed", label: "Falha" },
] as const;

const ROBOT_FORM_STATUS_OPTIONS = ROBOT_STATUS_OPTIONS.filter((option) => option.value);

const ROBOT_TYPE_OPTIONS = [
  { value: "", label: "Todos os tipos" },
  { value: "Backup", label: "Backup" },
  { value: "Relatorio", label: "Relatório" },
  { value: "Integracao", label: "Integração" },
  { value: "Manutencao", label: "Manutenção" },
  { value: "Monitoramento", label: "Monitoramento" },
] as const;

const ROBOT_FORM_TYPE_OPTIONS = ROBOT_TYPE_OPTIONS.filter((option) => option.value);

const ROBOT_ACTIVE_FILTER_OPTIONS = [
  { value: "", label: "Todos" },
  { value: "true", label: "Ativos" },
  { value: "false", label: "Inativos" },
] as const;

const ROBOT_ACTIVE_FORM_OPTIONS = [
  { value: "true", label: "Ativo" },
  { value: "false", label: "Inativo" },
] as const;

const ROBOT_RUN_STATUS_OPTIONS = [
  { value: "success", label: "Sucesso" },
  { value: "failed", label: "Falha" },
  { value: "running", label: "Em execução" },
  { value: "cancelled", label: "Cancelada" },
] as const;

type RobotDraft = {
  name: string;
  description: string;
  type: TiRobotType | string;
  status: string;
  active: boolean;
  schedule: string;
};

type RunDraft = {
  status: string;
  message: string;
  durationTime: string;
};

type AutomationMetric = {
  label: string;
  value: number;
  helper: string;
  icon: LucideIcon;
};

const INITIAL_ROBOT_DRAFT: RobotDraft = {
  name: "",
  description: "",
  type: "Monitoramento",
  status: "active",
  active: true,
  schedule: "",
};

const INITIAL_RUN_DRAFT: RunDraft = {
  status: "success",
  message: "",
  durationTime: "",
};

function getStringField(source: Record<string, unknown> | undefined, fields: string[], fallback = "") {
  if (!source) {
    return fallback;
  }

  for (const field of fields) {
    const value = source[field];

    if (typeof value === "string" && value.trim()) {
      return value;
    }

    if (typeof value === "number") {
      return String(value);
    }
  }

  return fallback;
}

function getRobotName(robot: TiRobot | undefined) {
  return robot?.name ?? getStringField(robot, ["title", "label"], "Robô sem nome");
}

function getStatusLabel(status: unknown) {
  const statusText = typeof status === "boolean" ? (status ? "active" : "inactive") : String(status ?? "");
  const normalizedStatus = statusText.toLowerCase();
  const option = [...ROBOT_FORM_STATUS_OPTIONS, ...ROBOT_RUN_STATUS_OPTIONS].find(
    (item) => item.value === normalizedStatus,
  );

  return option?.label ?? (statusText || "Sem status");
}

function getRobotTypeLabel(type: unknown) {
  const typeText = String(type ?? "");
  const option = ROBOT_TYPE_OPTIONS.find((item) => item.value === typeText);

  return option?.label ?? (typeText || "Sem tipo");
}

function normalizeRobotFilters(filters: TiListFilters): TiListFilters | undefined {
  const normalizedFilters = Object.fromEntries(
    Object.entries(filters).filter(([, value]) => value !== undefined && value !== null && value !== ""),
  ) as TiListFilters;

  return Object.keys(normalizedFilters).length > 0 ? normalizedFilters : undefined;
}

function isRobotActive(robot: TiRobot) {
  if (typeof robot.active === "boolean") {
    return robot.active;
  }

  if (typeof robot.status === "boolean") {
    return robot.status;
  }

  return ["active", "enabled", "running"].includes(String(robot.status ?? "").toLowerCase());
}

function isFailedRun(run: TiRobotRun) {
  const status = String(run.status ?? "").toLowerCase();

  return ["failed", "failure", "error"].includes(status);
}

function getRunMessage(run: TiRobotRun) {
  return getStringField(run, ["message", "output", "error_message"], "Sem retorno registrado.");
}

function getRunDate(run: TiRobotRun) {
  return run.finished_at ?? run.started_at ?? null;
}

function getLatestDateValue(values: Array<string | null | undefined>) {
  let latestDate: string | null = null;
  let latestRunTimestamp = Number.NEGATIVE_INFINITY;

  for (const value of values) {
    if (!value) {
      continue;
    }

    const runTimestamp = new Date(value).getTime();

    if (Number.isNaN(runTimestamp)) {
      latestDate ??= value;
      continue;
    }

    if (runTimestamp > latestRunTimestamp) {
      latestDate = value;
      latestRunTimestamp = runTimestamp;
    }
  }

  return latestDate;
}

function getLatestRunDate(runs: TiRobotRun[]) {
  return getLatestDateValue(runs.map(getRunDate));
}

function getWeekdayLabel(value: string) {
  return (
    {
      "0": "domingo",
      "1": "segunda",
      "2": "terça",
      "3": "quarta",
      "4": "quinta",
      "5": "sexta",
      "6": "sábado",
    }[value] ?? "dia configurado"
  );
}

function formatSchedule(value: string | null | undefined) {
  const schedule = value?.trim();

  if (!schedule) {
    return "Sem execução prevista";
  }

  const [minute, hour, day, month, weekday] = schedule.split(/\s+/);
  const hasTime = /^\d{1,2}$/.test(minute ?? "") && /^\d{1,2}$/.test(hour ?? "");
  const time = hasTime ? `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}` : "";

  if (hasTime && day === "*" && month === "*" && weekday === "*") {
    return `Diariamente às ${time}`;
  }

  if (hasTime && day === "*" && month === "*" && /^\d$/.test(weekday ?? "")) {
    return `${getWeekdayLabel(weekday ?? "")} às ${time}`;
  }

  if (hasTime && /^\d{1,2}$/.test(day ?? "") && month === "*" && weekday === "*") {
    return `Mensalmente no dia ${day} às ${time}`;
  }

  return schedule;
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "Não informado";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (error && typeof error === "object" && "response" in error) {
    const response = (error as { response?: { data?: { message?: string } } }).response;

    if (response?.data?.message) {
      return response.data.message;
    }
  }

  return "Não foi possível concluir a ação.";
}

function buildRobotPayload(draft: RobotDraft): TiRobotPayload {
  return {
    name: draft.name.trim(),
    description: draft.description.trim() || null,
    type: draft.type,
    status: draft.status,
    active: draft.active,
    schedule: draft.schedule.trim() || null,
  };
}

function parseDurationMs(value: string) {
  const durationText = value.trim().toLowerCase();

  if (!durationText) {
    return undefined;
  }

  const timeMatch = /^(\d+):([0-5]\d):([0-5]\d)$/.exec(durationText);

  if (timeMatch) {
    const [, hours, minutes, seconds] = timeMatch;
    const hoursValue = Number(hours);
    const minutesValue = Number(minutes);
    const secondsValue = Number(seconds);

    return (hoursValue * 60 * 60 + minutesValue * 60 + secondsValue) * 1000;
  }

  let durationMs = 0;
  let hasDurationPart = false;
  const remainingText = durationText
    .replace(
      /(\d+)\s*(h|hora|horas|min|m|minuto|minutos|s|seg|segundo|segundos)\b/g,
      (_, amount: string, unit: string) => {
        const durationAmount = Number(amount);
        hasDurationPart = true;

        if (["h", "hora", "horas"].includes(unit)) {
          durationMs += durationAmount * 60 * 60 * 1000;
        } else if (["min", "m", "minuto", "minutos"].includes(unit)) {
          durationMs += durationAmount * 60 * 1000;
        } else {
          durationMs += durationAmount * 1000;
        }

        return " ";
      },
    )
    .replace(/\be\b/g, " ")
    .replace(/[,\s]+/g, "");

  if (!hasDurationPart || remainingText) {
    throw new Error("Informe um tempo, por exemplo: 12 min ou 00:12:00.");
  }

  return durationMs;
}

function buildRunMetadata(draft: RunDraft): Record<string, unknown> | undefined {
  const durationMs = parseDurationMs(draft.durationTime);

  if (durationMs === undefined) {
    return undefined;
  }

  return { durationMs };
}

function buildRunPayload(draft: RunDraft, finishedAt: string): TiRobotRunPayload {
  return {
    status: draft.status,
    finished_at: finishedAt,
    message: draft.message.trim() || undefined,
    metadata_json: buildRunMetadata(draft),
  };
}

function createRobotDraft(robot?: TiRobot): RobotDraft {
  return {
    name: getRobotName(robot) === "Robô sem nome" ? "" : getRobotName(robot),
    description: robot?.description ?? getStringField(robot, ["details", "summary"]),
    type: String(robot?.type ?? "Monitoramento"),
    status: String(robot?.status ?? "active"),
    active: typeof robot?.active === "boolean" ? robot.active : String(robot?.status ?? "active") !== "inactive",
    schedule: robot?.schedule ?? getStringField(robot, ["cron", "frequency"]),
  };
}

export function TiRobotsTab() {
  const [filters, setFilters] = useState<TiListFilters>({});
  const [activeRobotId, setActiveRobotId] = useState<TiId | undefined>();
  const [isRobotDialogOpen, setIsRobotDialogOpen] = useState(false);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [isRunDialogOpen, setIsRunDialogOpen] = useState(false);
  const [editingRobot, setEditingRobot] = useState<TiRobot | undefined>();
  const [robotDraft, setRobotDraft] = useState<RobotDraft>(INITIAL_ROBOT_DRAFT);
  const [runDraft, setRunDraft] = useState<RunDraft>(INITIAL_RUN_DRAFT);
  const [lastRunOverrides, setLastRunOverrides] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const normalizedFilters = useMemo(() => normalizeRobotFilters(filters), [filters]);
  const robotsQuery = useTiRobots(normalizedFilters);
  const robots = robotsQuery.data ?? [];
  const selectedRobot = robots.find((robot) => String(robot.id) === String(activeRobotId));
  const selectedRobotId = activeRobotId;
  const robotDetailQuery = useTiRobot(selectedRobotId);
  const runsQuery = useTiRobotRuns(selectedRobotId);
  const activeRobot = robotDetailQuery.data ?? selectedRobot;

  const createRobotMutation = useCreateTiRobot();
  const updateRobotMutation = useUpdateTiRobot();
  const createRunMutation = useCreateTiRobotRun();

  const isRobotSaving = createRobotMutation.isPending || updateRobotMutation.isPending;
  const isRunSaving = createRunMutation.isPending;

  const visibleRuns = useMemo(() => runsQuery.data ?? [], [runsQuery.data]);
  const selectedRobotKey = selectedRobotId === undefined ? undefined : String(selectedRobotId);
  const latestSelectedRunAt = useMemo(
    () =>
      getLatestDateValue([
        selectedRobotKey ? lastRunOverrides[selectedRobotKey] : undefined,
        getLatestRunDate(visibleRuns),
        activeRobot?.last_run_at,
        selectedRobot?.last_run_at,
      ]),
    [activeRobot?.last_run_at, lastRunOverrides, selectedRobot?.last_run_at, selectedRobotKey, visibleRuns],
  );
  const activeRobotsCount = useMemo(() => robots.filter(isRobotActive).length, [robots]);
  const failedRunsCount = useMemo(() => visibleRuns.filter(isFailedRun).length, [visibleRuns]);
  const automationMetrics = useMemo<AutomationMetric[]>(
    () => [
      {
        label: "Robôs ativos",
        value: activeRobotsCount,
        helper: "Disponíveis na lista atual",
        icon: Bot,
      },
      {
        label: "Execuções do robô",
        value: visibleRuns.length,
        helper: activeRobot ? "Histórico do item selecionado" : "Selecione um robô",
        icon: History,
      },
      {
        label: "Falhas do robô",
        value: failedRunsCount,
        helper: runsQuery.isLoading ? "Carregando histórico" : "Erros no histórico selecionado",
        icon: TriangleAlert,
      },
    ],
    [activeRobot, activeRobotsCount, failedRunsCount, runsQuery.isLoading, visibleRuns.length],
  );

  function handleTypeChange(value: string) {
    setFilters((current) => ({
      ...current,
      type: value,
    }));
  }

  function handleStatusChange(value: string) {
    setFilters((current) => ({
      ...current,
      status: value,
    }));
  }

  function handleActiveChange(value: string) {
    setFilters((current) => ({
      ...current,
      active: value,
    }));
  }

  function getRobotLastRunAt(robot: TiRobot) {
    const runOverride = lastRunOverrides[String(robot.id)];

    if (String(robot.id) === String(selectedRobotId)) {
      return getLatestDateValue([runOverride, latestSelectedRunAt, robot.last_run_at]);
    }

    return getLatestDateValue([runOverride, robot.last_run_at]);
  }

  function clearRobotSelection() {
    setActiveRobotId(undefined);
    setActionError(null);
    setIsDetailDialogOpen(false);
  }

  function selectRobot(robotId: TiId) {
    setActiveRobotId(robotId);
    setActionError(null);
  }

  function openRobotDetail(robotId = selectedRobotId) {
    if (!robotId) {
      return;
    }

    setActiveRobotId(robotId);
    setActionError(null);
    setIsDetailDialogOpen(true);
  }

  function handleRobotRowKeyDown(event: KeyboardEvent<HTMLTableRowElement>, robotId: TiId) {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    selectRobot(robotId);
  }

  function handleRobotsPanelClick(event: MouseEvent<HTMLElement>) {
    const target = event.target;

    if (
      !(target instanceof Element) ||
      target.closest("[data-ti-robot-row]") ||
      target.closest("[data-ti-selection-control]")
    ) {
      return;
    }

    clearRobotSelection();
  }

  function handleDetailDialogOpenChange(nextOpen: boolean) {
    setIsDetailDialogOpen(nextOpen);

    if (!nextOpen) {
      setActionError(null);
    }
  }

  function openCreateDialog() {
    clearRobotSelection();
    setEditingRobot(undefined);
    setRobotDraft(INITIAL_ROBOT_DRAFT);
    setFormError(null);
    setIsRobotDialogOpen(true);
  }

  function openEditDialog(robot: TiRobot) {
    setEditingRobot(robot);
    setRobotDraft(createRobotDraft(robot));
    setFormError(null);
    setIsRobotDialogOpen(true);
  }

  function openRunDialog() {
    setRunDraft(INITIAL_RUN_DRAFT);
    setFormError(null);
    setActionError(null);
    setIsRunDialogOpen(true);
  }

  async function handleSaveRobot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    if (!robotDraft.name.trim()) {
      setFormError("Informe o nome do robô.");
      return;
    }

    if (!robotDraft.type) {
      setFormError("Informe o tipo do robô.");
      return;
    }

    try {
      const payload = buildRobotPayload(robotDraft);
      if (editingRobot) {
        await updateRobotMutation.mutateAsync({ id: editingRobot.id, payload });
      } else {
        await createRobotMutation.mutateAsync(payload);
      }

      setIsRobotDialogOpen(false);
    } catch (error) {
      setFormError(getErrorMessage(error));
    }
  }

  async function handleCreateRun(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setActionError(null);

    if (!selectedRobotId) {
      setFormError("Selecione um robô antes de registrar a execução.");
      return;
    }

    try {
      const finishedAt = new Date().toISOString();
      const createdRun = await createRunMutation.mutateAsync({
        id: selectedRobotId,
        payload: buildRunPayload(runDraft, finishedAt),
      });
      const createdRunAt = getRunDate(createdRun) ?? finishedAt;

      setLastRunOverrides((current) => ({
        ...current,
        [String(selectedRobotId)]: createdRunAt,
      }));
      setIsRunDialogOpen(false);
    } catch (error) {
      setFormError(getErrorMessage(error));
      setActionError(getErrorMessage(error));
    }
  }

  return (
    <TiPanel className="space-y-4 p-4 sm:p-5" onClick={handleRobotsPanelClick}>
      <TiSectionHeader
        title="Robôs"
        description="Acompanhe automações, rotinas agendadas e histórico de execução."
        action={
          <div className="flex flex-wrap justify-end gap-2" data-ti-selection-control>
            {activeRobot ? (
              <TiIconAction
                icon={Eye}
                label="Ver detalhes"
                onClick={() => openRobotDetail(activeRobot.id)}
              />
            ) : null}
            <TiIconAction
              icon={Plus}
              label="Novo robô"
              variant="primary"
              onClick={openCreateDialog}
            />
          </div>
        }
      />

      <div className="grid gap-3 md:grid-cols-3">
        <TiNativeSelect
          label="Tipo"
          value={String(filters.type ?? "")}
          options={ROBOT_TYPE_OPTIONS}
          onChange={(event) => handleTypeChange(event.target.value)}
        />
        <TiNativeSelect
          label="Status"
          value={String(filters.status ?? "")}
          options={ROBOT_STATUS_OPTIONS}
          onChange={(event) => handleStatusChange(event.target.value)}
        />
        <TiNativeSelect
          label="Ativo"
          value={String(filters.active ?? "")}
          options={ROBOT_ACTIVE_FILTER_OPTIONS}
          onChange={(event) => handleActiveChange(event.target.value)}
        />
      </div>

      {!robotsQuery.isLoading && !robotsQuery.isError ? (
        <div className="grid gap-3 md:grid-cols-3">
          {automationMetrics.map((metric) => {
            const Icon = metric.icon;

            return (
              <div
                key={metric.label}
                className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-normal text-slate-500 dark:text-slate-400">
                      {metric.label}
                    </p>
                    <p className="mt-1 text-xl font-semibold tracking-normal text-slate-950 dark:text-white">
                      {metric.value}
                    </p>
                  </div>
                  <span className="rounded-md bg-blue-50 p-1.5 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300">
                    <Icon className="h-4 w-4" />
                  </span>
                </div>
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{metric.helper}</p>
              </div>
            );
          })}
        </div>
      ) : null}

      {robotsQuery.isError ? (
        <TiEmptyState
          icon={RefreshCw}
          title="Não foi possível carregar robôs"
          description="Tente novamente ou revise as permissões do seu perfil."
          action={
            <button type="button" className={tiSecondaryButtonClassName} onClick={() => robotsQuery.refetch()}>
              <RefreshCw className="h-4 w-4" />
              <span>Tentar novamente</span>
            </button>
          }
        />
      ) : null}

      {robotsQuery.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Carregando robôs...</span>
        </div>
      ) : null}

      {!robotsQuery.isLoading && !robotsQuery.isError && robots.length === 0 ? (
        <TiEmptyState
          icon={Bot}
          title="Nenhum robô cadastrado"
          description="As automações do time de Tecnologia aparecem aqui com seus últimos resultados."
          action={<TiIconAction icon={Plus} label="Novo robô" variant="primary" onClick={openCreateDialog} />}
        />
      ) : null}

      {robots.length > 0 ? (
        <div className="space-y-0">
          <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-normal text-slate-500 dark:bg-slate-950/50 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Robô</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Última execução</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-900">
                  {robots.map((robot) => {
                    const isActive = String(robot.id) === String(selectedRobotId);

                    return (
                      <tr
                        key={robot.id}
                        className={cn(
                          "cursor-pointer transition hover:bg-slate-50 focus-visible:outline-none",
                          "focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2",
                          "focus-visible:ring-offset-white dark:hover:bg-slate-800/70",
                          "dark:focus-visible:ring-offset-slate-900",
                          isActive ? "bg-blue-50 dark:bg-blue-950/30" : null,
                        )}
                        role="button"
                        tabIndex={0}
                        data-ti-robot-row
                        aria-selected={isActive}
                        onClick={() => selectRobot(robot.id)}
                        onKeyDown={(event) => handleRobotRowKeyDown(event, robot.id)}
                      >
                        <td className="min-w-56 px-4 py-2.5">
                          <span className="block font-medium text-slate-950 dark:text-white">
                            {getRobotName(robot)}
                          </span>
                          <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                            {getRobotTypeLabel(robot.type)}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-slate-700 dark:text-slate-200">
                          {getStatusLabel(robot.status)}
                        </td>
                        <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">
                          {formatDate(getRobotLastRunAt(robot))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      <Dialog
        open={isDetailDialogOpen}
        onOpenChange={handleDetailDialogOpenChange}
        title={activeRobot ? getRobotName(activeRobot) : "Detalhe do robô"}
        description="Detalhe, execução e histórico da automação."
        contentClassName="w-[min(92vw,760px)] overflow-hidden border-slate-300 shadow-2xl dark:border-slate-700"
        bodyClassName="space-y-3 bg-slate-100/70 !px-4 !py-3 dark:bg-slate-950/50"
      >
        {actionError ? (
          <div className="mx-auto max-w-2xl rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300">
            {actionError}
          </div>
        ) : null}

        {selectedRobotId ? (
          <div className="mx-auto max-w-2xl space-y-3 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 sm:p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-lg font-semibold text-slate-950 dark:text-white">
                  {activeRobot ? getRobotName(activeRobot) : "Carregando robô"}
                </h3>
                <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">
                  {activeRobot?.description ?? getStringField(activeRobot, ["details"], "Sem descrição.")}
                </p>
              </div>
              {robotDetailQuery.isLoading ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-slate-500" />
              ) : null}
            </div>

            {robotDetailQuery.isError ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200">
                Não foi possível atualizar o detalhe deste robô.
              </div>
            ) : null}

            {activeRobot ? (
              <>
                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className={tiLabelClassName}>Status</dt>
                    <dd className="mt-1 text-slate-700 dark:text-slate-200">
                      {getStatusLabel(activeRobot.status)}
                    </dd>
                  </div>
                  <div>
                    <dt className={tiLabelClassName}>Execução prevista</dt>
                    <dd className="mt-1 text-slate-700 dark:text-slate-200">
                      {formatSchedule(activeRobot.schedule ?? getStringField(activeRobot, ["cron", "frequency"]))}
                    </dd>
                  </div>
                  <div>
                    <dt className={tiLabelClassName}>Tipo</dt>
                    <dd className="mt-1 text-slate-700 dark:text-slate-200">
                      {getRobotTypeLabel(activeRobot.type)}
                    </dd>
                  </div>
                  <div>
                    <dt className={tiLabelClassName}>Ativo</dt>
                    <dd className="mt-1 text-slate-700 dark:text-slate-200">
                      {isRobotActive(activeRobot) ? "Sim" : "Não"}
                    </dd>
                  </div>
                  <div>
                    <dt className={tiLabelClassName}>Última execução</dt>
                    <dd className="mt-1 text-slate-700 dark:text-slate-200">
                      {formatDate(latestSelectedRunAt ?? activeRobot.last_run_at)}
                    </dd>
                  </div>
                </dl>

                <div className="flex flex-wrap justify-center gap-2">
                  <button
                    type="button"
                    className={tiSecondaryButtonClassName}
                    onClick={() => openEditDialog(activeRobot)}
                  >
                    <Pencil className="h-4 w-4" />
                    <span>Editar robô</span>
                  </button>
                  <button type="button" className={tiPrimaryButtonClassName} onClick={openRunDialog}>
                    <PlayCircle className="h-4 w-4" />
                    <span>Registrar execução</span>
                  </button>
                </div>
              </>
            ) : null}
          </div>
        ) : null}

        {selectedRobotId ? (
          <div className="mx-auto max-w-2xl space-y-3 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 sm:p-4">
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-sm font-semibold text-slate-950 dark:text-white">
                Histórico de execuções
              </h4>
              <History className="h-4 w-4 text-blue-600 dark:text-blue-300" />
            </div>

            {runsQuery.isLoading ? (
              <p className="text-sm text-slate-600 dark:text-slate-300">Carregando execuções...</p>
            ) : null}

            {runsQuery.isError ? (
              <p className="text-sm text-red-600 dark:text-red-300">
                Não foi possível carregar as execuções.
              </p>
            ) : null}

            {!runsQuery.isLoading && !runsQuery.isError && visibleRuns.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Nenhuma execução registrada para este robô.
              </p>
            ) : null}

            {visibleRuns.length > 0 ? (
              <div
                aria-label="Histórico de execuções do robô"
                className={cn(
                  "h-32 divide-y divide-slate-200 overflow-y-auto overscroll-contain pr-2 dark:divide-slate-800",
                  tiThinScrollbarClassName,
                )}
                role="list"
              >
                {visibleRuns.map((run) => (
                  <div
                    key={run.id}
                    className="flex items-start justify-between gap-3 py-2 text-sm"
                    role="listitem"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-slate-950 dark:text-white">
                        {getStatusLabel(run.status)}
                      </p>
                      <p className="mt-0.5 line-clamp-2 text-slate-600 dark:text-slate-300">
                        {getRunMessage(run)}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400">
                      {formatDate(run.finished_at ?? run.started_at)}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </Dialog>

      <Dialog
        open={isRobotDialogOpen}
        onOpenChange={setIsRobotDialogOpen}
        title={editingRobot ? "Editar robô" : "Novo robô"}
        description="Formulário de robô"
        contentClassName="w-[min(92vw,720px)]"
        bodyClassName="space-y-4"
      >
        <form className="space-y-4" onSubmit={handleSaveRobot}>
          {formError ? (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300">
              {formError}
            </div>
          ) : null}

          <label className="flex min-w-0 flex-col gap-2">
            <span className={tiLabelClassName}>Nome</span>
            <input
              className={tiInputClassName}
              value={robotDraft.name}
              onChange={(event) => setRobotDraft((draft) => ({ ...draft, name: event.target.value }))}
            />
          </label>

          <label className="flex min-w-0 flex-col gap-2">
            <span className={tiLabelClassName}>Descrição</span>
            <textarea
              className={cn(tiInputClassName, "h-auto min-h-24 py-2")}
              value={robotDraft.description}
              onChange={(event) =>
                setRobotDraft((draft) => ({ ...draft, description: event.target.value }))
              }
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <TiNativeSelect
              label="Tipo"
              value={robotDraft.type}
              options={ROBOT_FORM_TYPE_OPTIONS}
              onChange={(event) =>
                setRobotDraft((draft) => ({ ...draft, type: event.target.value }))
              }
            />
            <TiNativeSelect
              label="Status"
              value={robotDraft.status}
              options={ROBOT_FORM_STATUS_OPTIONS}
              onChange={(event) =>
                setRobotDraft((draft) => ({ ...draft, status: event.target.value }))
              }
            />
            <TiNativeSelect
              label="Ativo"
              value={String(robotDraft.active)}
              options={ROBOT_ACTIVE_FORM_OPTIONS}
              onChange={(event) =>
                setRobotDraft((draft) => ({ ...draft, active: event.target.value === "true" }))
              }
            />
            <label className="flex min-w-0 flex-col gap-2">
              <span className={tiLabelClassName}>Execução prevista</span>
              <input
                aria-describedby="robot-schedule-help"
                className={tiInputClassName}
                value={robotDraft.schedule}
                placeholder="Sob demanda ou diariamente às 02:00"
                onChange={(event) =>
                  setRobotDraft((draft) => ({ ...draft, schedule: event.target.value }))
                }
              />
              <span id="robot-schedule-help" className="text-xs leading-5 text-slate-500 dark:text-slate-400">
                Ex.: sob demanda, diariamente às 02:00 ou após fechamento.
              </span>
            </label>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              className={tiSecondaryButtonClassName}
              onClick={() => setIsRobotDialogOpen(false)}
            >
              Cancelar
            </button>
            <button type="submit" className={tiPrimaryButtonClassName} disabled={isRobotSaving}>
              {isRobotSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              <span>{isRobotSaving ? "Salvando..." : "Salvar"}</span>
            </button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={isRunDialogOpen}
        onOpenChange={setIsRunDialogOpen}
        title="Registrar execução"
        description="Registro de execução de robô"
        contentClassName="w-[min(92vw,560px)]"
        bodyClassName="space-y-4"
      >
        <form className="space-y-4" onSubmit={handleCreateRun}>
          {formError ? (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300">
              {formError}
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_150px]">
            <TiNativeSelect
              label="Resultado"
              value={runDraft.status}
              options={ROBOT_RUN_STATUS_OPTIONS}
              onChange={(event) =>
                setRunDraft((draft) => ({ ...draft, status: event.target.value }))
              }
            />
            <label className="flex min-w-0 flex-col gap-2">
              <span className={tiLabelClassName}>Tempo gasto</span>
              <input
                aria-label="Tempo gasto"
                className={cn(tiInputClassName, "text-center")}
                value={runDraft.durationTime}
                placeholder="12 min ou 00:12:00"
                onChange={(event) =>
                  setRunDraft((draft) => ({ ...draft, durationTime: event.target.value }))
                }
              />
            </label>
          </div>

          <label className="flex min-w-0 flex-col gap-2">
            <span className={tiLabelClassName}>Mensagem</span>
            <textarea
              className={cn(tiInputClassName, "h-auto min-h-20 py-2")}
              value={runDraft.message}
              onChange={(event) => setRunDraft((draft) => ({ ...draft, message: event.target.value }))}
            />
          </label>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              className={tiSecondaryButtonClassName}
              onClick={() => setIsRunDialogOpen(false)}
            >
              Cancelar
            </button>
            <button type="submit" className={tiPrimaryButtonClassName} disabled={isRunSaving}>
              {isRunSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clock3 className="h-4 w-4" />}
              <span>{isRunSaving ? "Registrando..." : "Registrar"}</span>
            </button>
          </div>
        </form>
      </Dialog>
    </TiPanel>
  );
}
