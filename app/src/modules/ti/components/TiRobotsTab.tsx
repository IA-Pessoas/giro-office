import { useMemo, useState, type FormEvent, type KeyboardEvent } from "react";
import {
  Bot,
  CheckCircle2,
  Clock3,
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
  metadataJson: string;
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
  metadataJson: "",
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

function parseRunMetadataJson(value: string): Record<string, unknown> | undefined {
  const metadataText = value.trim();

  if (!metadataText) {
    return undefined;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(metadataText) as unknown;
  } catch {
    throw new Error("Informe metadados em JSON válido.");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Informe metadados como um objeto JSON.");
  }

  return parsed as Record<string, unknown>;
}

function buildRunPayload(draft: RunDraft): TiRobotRunPayload {
  return {
    status: draft.status,
    message: draft.message.trim() || undefined,
    metadata_json: parseRunMetadataJson(draft.metadataJson),
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
        helper: activeRobot ? "Histórico do item selecionado" : "Abra um robô",
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

  function selectRobot(robotId: TiId) {
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

  function openCreateDialog() {
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
      const savedRobot = editingRobot
        ? await updateRobotMutation.mutateAsync({ id: editingRobot.id, payload })
        : await createRobotMutation.mutateAsync(payload);

      setActiveRobotId(savedRobot.id);
      setIsRobotDialogOpen(false);
      setIsDetailDialogOpen(true);
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
      await createRunMutation.mutateAsync({
        id: selectedRobotId,
        payload: buildRunPayload(runDraft),
      });
      setIsRunDialogOpen(false);
    } catch (error) {
      setFormError(getErrorMessage(error));
      setActionError(getErrorMessage(error));
    }
  }

  return (
    <TiPanel className="space-y-5">
      <TiSectionHeader
        title="Robôs"
        description="Acompanhe automações, rotinas agendadas e histórico de execução."
        action={<TiIconAction icon={Plus} label="Novo robô" variant="primary" onClick={openCreateDialog} />}
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
                className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-normal text-slate-500 dark:text-slate-400">
                      {metric.label}
                    </p>
                    <p className="mt-2 text-2xl font-semibold tracking-normal text-slate-950 dark:text-white">
                      {metric.value}
                    </p>
                  </div>
                  <span className="rounded-lg bg-blue-50 p-2 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300">
                    <Icon className="h-4 w-4" />
                  </span>
                </div>
                <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">{metric.helper}</p>
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
                        aria-selected={isActive}
                        onClick={() => selectRobot(robot.id)}
                        onKeyDown={(event) => handleRobotRowKeyDown(event, robot.id)}
                      >
                        <td className="min-w-56 px-4 py-3">
                          <span className="block font-medium text-slate-950 dark:text-white">
                            {getRobotName(robot)}
                          </span>
                          <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                            {getRobotTypeLabel(robot.type)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-200">
                          {getStatusLabel(robot.status)}
                        </td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                          {formatDate(robot.last_run_at)}
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
        onOpenChange={(nextOpen) => {
          setIsDetailDialogOpen(nextOpen);
          if (!nextOpen) {
            setActionError(null);
          }
        }}
        title={activeRobot ? getRobotName(activeRobot) : "Detalhe do robô"}
        description="Detalhe, execução e histórico da automação."
        contentClassName="w-[min(94vw,900px)] overflow-hidden border-slate-300 shadow-2xl dark:border-slate-700"
        bodyClassName="max-h-[72vh] space-y-4 overflow-y-auto bg-slate-100/70 dark:bg-slate-950/50"
      >
        {actionError ? (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300">
            {actionError}
          </div>
        ) : null}

        {selectedRobotId ? (
          <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
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
                    <dt className={tiLabelClassName}>Agenda</dt>
                    <dd className="mt-1 text-slate-700 dark:text-slate-200">
                      {activeRobot.schedule ?? getStringField(activeRobot, ["cron", "frequency"], "Não informada")}
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
                      {formatDate(activeRobot.last_run_at)}
                    </dd>
                  </div>
                </dl>

                <div className="flex flex-wrap gap-2">
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
          <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
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

            {visibleRuns.map((run) => (
              <div
                key={run.id}
                className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-800 dark:bg-slate-950/40"
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="font-medium text-slate-950 dark:text-white">
                    {getStatusLabel(run.status)}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {formatDate(run.finished_at ?? run.started_at)}
                  </span>
                </div>
                <p className="line-clamp-3 text-slate-600 dark:text-slate-300">
                  {getRunMessage(run)}
                </p>
              </div>
            ))}
          </div>
        ) : null}
      </Dialog>

      <Dialog
        open={isRobotDialogOpen}
        onOpenChange={setIsRobotDialogOpen}
        title={editingRobot ? "Editar robô" : "Novo robô"}
        description="Formulário de robô"
        contentClassName="w-[min(92vw,720px)]"
        bodyClassName="max-h-[72vh] space-y-4 overflow-y-auto"
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
              <span className={tiLabelClassName}>Agenda</span>
              <input
                className={tiInputClassName}
                value={robotDraft.schedule}
                placeholder="Diária, semanal ou cron"
                onChange={(event) =>
                  setRobotDraft((draft) => ({ ...draft, schedule: event.target.value }))
                }
              />
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
        contentClassName="w-[min(92vw,640px)]"
        bodyClassName="space-y-4"
      >
        <form className="space-y-4" onSubmit={handleCreateRun}>
          {formError ? (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300">
              {formError}
            </div>
          ) : null}

          <TiNativeSelect
            label="Resultado"
            value={runDraft.status}
            options={ROBOT_RUN_STATUS_OPTIONS}
            onChange={(event) => setRunDraft((draft) => ({ ...draft, status: event.target.value }))}
          />

          <label className="flex min-w-0 flex-col gap-2">
            <span className={tiLabelClassName}>Mensagem</span>
            <textarea
              className={cn(tiInputClassName, "h-auto min-h-24 py-2")}
              value={runDraft.message}
              onChange={(event) => setRunDraft((draft) => ({ ...draft, message: event.target.value }))}
            />
          </label>

          <label className="flex min-w-0 flex-col gap-2">
            <span className={tiLabelClassName}>Metadados JSON</span>
            <textarea
              className={cn(tiInputClassName, "h-auto min-h-20 py-2")}
              value={runDraft.metadataJson}
              placeholder='{"durationMs": 2300}'
              onChange={(event) =>
                setRunDraft((draft) => ({ ...draft, metadataJson: event.target.value }))
              }
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
