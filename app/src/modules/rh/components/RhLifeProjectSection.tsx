import { useEffect, useState, type FormEvent } from "react";
import { CalendarDays, LoaderCircle, Plus, Save, Target, UserRound } from "lucide-react";
import { toast } from "@shared/services/toast";

import { useRhDossierList } from "../hooks/useRhProfile";
import {
  useCreateRhLifeObjectiveMutation,
  useCreateRhLifeProjectMutation,
  useRhLifeProject,
  useUpdateRhLifeObjectiveMutation,
  useUpdateRhLifeProjectMutation,
} from "../hooks/useRhLifeProject";
import { useRhPermissions } from "../hooks/useRhPermissions";
import { getRhErrorMessage } from "../utils/rhErrorMessage";
import type { RhDossierListItem, RhLifeObjectiveStatus, RhLifeProjectObjective } from "../types";

const RH_TEAM_PERMISSION = 2;
const OBJECTIVE_STATUS_LABELS: Record<RhLifeObjectiveStatus, string> = {
  ToDo: "A realizar",
  Realized: "Realizado",
  Discontinued: "Descontinuado",
};

const inputClass =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-gray-100 dark:border-gray-600 dark:bg-gray-900 dark:text-white dark:focus:ring-blue-900/40 dark:disabled:bg-gray-800";
const labelClass = "mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300";

function todayYear(): number {
  return new Date().getFullYear();
}

function dateInputValue(value: string | null): string {
  return value?.slice(0, 10) ?? "";
}

function StatusPanel({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-5 py-6 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
      {text}
    </div>
  );
}

export function RhLifeProjectSection() {
  const { user, canAccessRhPortal, canManageRh, permissionQuery } = useRhPermissions("life-project");
  const permission = user?.modules?.rh ?? 0;
  const canBrowseTeam = canManageRh || permission === RH_TEAM_PERMISSION;
  const canEdit = canManageRh || permission === 1;
  const [selectedUserId, setSelectedUserId] = useState<string | undefined>();
  const [year, setYear] = useState(todayYear());
  const dossierListQuery = useRhDossierList(canBrowseTeam);
  const targetUserId = canBrowseTeam ? selectedUserId : undefined;
  const canLoadProject =
    canAccessRhPortal && Number.isInteger(year) && year >= 1900 && year <= 9999 &&
    (!canBrowseTeam || Boolean(selectedUserId));
  const projectQuery = useRhLifeProject(year, targetUserId, canLoadProject);
  const createProjectMutation = useCreateRhLifeProjectMutation();
  const updateProjectMutation = useUpdateRhLifeProjectMutation();
  const createObjectiveMutation = useCreateRhLifeObjectiveMutation();
  const updateObjectiveMutation = useUpdateRhLifeObjectiveMutation();
  const project = projectQuery.data ?? null;
  const selectedCollaborator = dossierListQuery.data?.find((item) => item.id === selectedUserId);

  if (permissionQuery.isLoading) return <StatusPanel text="Validando acesso ao Projeto de Vida..." />;
  if (permissionQuery.error) return <StatusPanel text="Não foi possível validar o acesso ao RH." />;
  if (!canAccessRhPortal) return <StatusPanel text="Seu perfil não possui acesso ao Projeto de Vida." />;

  async function createProject() {
    try {
      await createProjectMutation.mutateAsync({ year, ...(targetUserId ? { target_user_id: targetUserId } : {}) });
      toast.success("Projeto de Vida criado.");
    } catch (error) {
      toast.error(getRhErrorMessage(error, "Não foi possível criar o Projeto de Vida."));
    }
  }

  async function saveStories(stories: { life_story: string; company_story: string }) {
    if (!project) return;
    try {
      await updateProjectMutation.mutateAsync({ id: project.id, ...stories });
      toast.success("Histórias atualizadas.");
    } catch (error) {
      toast.error(getRhErrorMessage(error, "Não foi possível atualizar as histórias."));
    }
  }

  async function createObjective(input: { title: string; forecast_date: string }): Promise<boolean> {
    if (!project) return false;
    try {
      await createObjectiveMutation.mutateAsync({
        projectId: project.id,
        title: input.title,
        ...(input.forecast_date ? { forecast_date: input.forecast_date } : {}),
      });
      toast.success("Objetivo adicionado.");
      return true;
    } catch (error) {
      toast.error(getRhErrorMessage(error, "Não foi possível adicionar o objetivo."));
      return false;
    }
  }

  async function saveObjective(objective: RhLifeProjectObjective, changes: ObjectiveChanges) {
    if (!project) return;
    try {
      await updateObjectiveMutation.mutateAsync({ projectId: project.id, objectiveId: objective.id, ...changes });
      toast.success("Objetivo atualizado.");
    } catch (error) {
      toast.error(getRhErrorMessage(error, "Não foi possível atualizar o objetivo."));
    }
  }

  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-600">
            <Target className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-600 dark:text-blue-300">
              Desenvolvimento anual
            </p>
            <h2 className="mt-1 text-xl font-semibold text-gray-900 dark:text-white">Projeto de Vida</h2>
            <p className="mt-1 max-w-2xl text-sm text-gray-600 dark:text-gray-400">
              Registre histórias importantes e acompanhe metas pessoais e profissionais.
            </p>
          </div>
        </div>

        <div className="grid w-full gap-3 sm:w-auto sm:grid-cols-2">
          {canBrowseTeam ? (
            <label>
              <span className={labelClass}>Colaborador</span>
              <select
                className={inputClass}
                value={selectedUserId ?? ""}
                onChange={(event) => setSelectedUserId(event.target.value || undefined)}
                disabled={dossierListQuery.isLoading}
              >
                <option value="">Selecione uma pessoa</option>
                {(dossierListQuery.data ?? []).map((item: RhDossierListItem) => (
                  <option key={item.id} value={item.id}>{item.full_name}</option>
                ))}
              </select>
            </label>
          ) : null}
          <label>
            <span className={labelClass}>Ano</span>
            <span className="relative block">
              <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                className={`${inputClass} pl-9`}
                type="number"
                min={1900}
                max={9999}
                step={1}
                value={year}
                onChange={(event) => setYear(Number(event.target.value))}
              />
            </span>
          </label>
        </div>
      </header>

      {canBrowseTeam && !selectedUserId ? (
        <StatusPanel text="Selecione um colaborador para consultar o projeto anual." />
      ) : null}
      {dossierListQuery.error ? (
        <StatusPanel text={getRhErrorMessage(dossierListQuery.error, "Não foi possível carregar os colaboradores autorizados.")} />
      ) : null}
      {canBrowseTeam && selectedUserId && !selectedCollaborator && !dossierListQuery.isLoading ? (
        <StatusPanel text="O colaborador selecionado não está disponível no seu escopo." />
      ) : null}
      {canLoadProject && projectQuery.isLoading ? <StatusPanel text="Carregando Projeto de Vida..." /> : null}
      {canLoadProject && projectQuery.error ? (
        <StatusPanel text={getRhErrorMessage(projectQuery.error, "Não foi possível carregar este Projeto de Vida.")} />
      ) : null}
      {canLoadProject && !projectQuery.isLoading && !projectQuery.error && !project ? (
        <EmptyProject
          year={year}
          collaboratorName={selectedCollaborator?.full_name ?? user?.name ?? "Você"}
          canEdit={canEdit}
          saving={createProjectMutation.isPending}
          onCreate={() => void createProject()}
        />
      ) : null}
      {project ? (
        <div className="space-y-5">
          <ProjectSummary project={project} collaboratorName={selectedCollaborator?.full_name ?? user?.name ?? "Você"} />
          <StoriesEditor
            key={`${project.id}:${project.updated_at}`}
            lifeStory={project.life_story}
            companyStory={project.company_story}
            canEdit={canEdit}
            saving={updateProjectMutation.isPending}
            onSave={(stories) => void saveStories(stories)}
          />
          <ObjectiveList
            objectives={project.objectives}
            canEdit={canEdit}
            isAdmin={canManageRh}
            saving={createObjectiveMutation.isPending || updateObjectiveMutation.isPending}
            onCreate={(input) => createObjective(input)}
            onSave={(objective, changes) => void saveObjective(objective, changes)}
          />
        </div>
      ) : null}
    </section>
  );
}

function EmptyProject({
  year,
  collaboratorName,
  canEdit,
  saving,
  onCreate,
}: {
  year: number;
  collaboratorName: string;
  canEdit: boolean;
  saving: boolean;
  onCreate: () => void;
}) {
  return (
    <div className="rounded-xl border border-dashed border-blue-200 bg-blue-50/60 px-6 py-10 text-center dark:border-blue-900/60 dark:bg-blue-950/20">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white text-blue-600 shadow-sm dark:bg-gray-800 dark:text-blue-300">
        <UserRound className="h-5 w-5" />
      </div>
      <h3 className="mt-3 text-base font-semibold text-gray-900 dark:text-white">Sem projeto para {year}</h3>
      <p className="mx-auto mt-1 max-w-lg text-sm text-gray-600 dark:text-gray-400">
        {collaboratorName} ainda não possui um Projeto de Vida cadastrado para este ano.
      </p>
      {canEdit ? (
        <button
          type="button"
          onClick={onCreate}
          disabled={saving}
          className="mt-5 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Criar projeto anual
        </button>
      ) : null}
    </div>
  );
}

function ProjectSummary({
  project,
  collaboratorName,
}: {
  project: { year: number; progress: number; objective_count: number; completed_objective_count: number };
  collaboratorName: string;
}) {
  const percent = Math.round(project.progress * 100);
  return (
    <div className="grid gap-4 rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800 md:grid-cols-[minmax(0,1fr)_minmax(250px,0.65fr)]">
      <div>
        <p className="text-sm text-gray-500 dark:text-gray-400">{collaboratorName}</p>
        <h3 className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">Plano de {project.year}</h3>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          {project.objective_count === 0
            ? "Adicione objetivos para começar a acompanhar o progresso."
            : `${project.completed_objective_count} de ${project.objective_count} objetivos realizados.`}
        </p>
      </div>
      <div className="self-center">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="font-medium text-gray-600 dark:text-gray-300">Progresso</span>
          <span className="font-semibold tabular-nums text-blue-700 dark:text-blue-300">{percent}%</span>
        </div>
        <div
          role="progressbar"
          aria-label="Progresso dos objetivos"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className="flex gap-1"
        >
          {Array.from({ length: 10 }, (_, index) => (
            <span
              key={index}
              className={`h-2.5 flex-1 rounded-full ${index < Math.ceil(percent / 10) ? "bg-blue-600" : "bg-gray-100 dark:bg-gray-700"}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function StoriesEditor({
  lifeStory,
  companyStory,
  canEdit,
  saving,
  onSave,
}: {
  lifeStory: string;
  companyStory: string;
  canEdit: boolean;
  saving: boolean;
  onSave: (stories: { life_story: string; company_story: string }) => void;
}) {
  const [draft, setDraft] = useState({ life_story: lifeStory, company_story: companyStory });
  useEffect(() => setDraft({ life_story: lifeStory, company_story: companyStory }), [lifeStory, companyStory]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave(draft);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
      <div>
        <h3 className="text-base font-semibold text-gray-900 dark:text-white">Histórias</h3>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Contexto pessoal e trajetória na empresa.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <label>
          <span className={labelClass}>História de vida</span>
          <textarea
            className={inputClass}
            rows={5}
            value={draft.life_story}
            onChange={(event) => setDraft((current) => ({ ...current, life_story: event.target.value }))}
            disabled={!canEdit}
            maxLength={10000}
          />
        </label>
        <label>
          <span className={labelClass}>História na empresa</span>
          <textarea
            className={inputClass}
            rows={5}
            value={draft.company_story}
            onChange={(event) => setDraft((current) => ({ ...current, company_story: event.target.value }))}
            disabled={!canEdit}
            maxLength={10000}
          />
        </label>
      </div>
      {canEdit ? (
        <div className="flex justify-end">
          <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-lg border border-blue-200 px-4 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-50 disabled:opacity-50 dark:border-blue-900 dark:text-blue-300 dark:hover:bg-blue-900/20">
            {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar histórias
          </button>
        </div>
      ) : null}
    </form>
  );
}

type ObjectiveChanges = {
  title: string;
  forecast_date: string | null;
  employee_observations: string;
  status?: RhLifeObjectiveStatus;
  completed_at?: string | null;
  rh_observations?: string;
};

function ObjectiveList({
  objectives,
  canEdit,
  isAdmin,
  saving,
  onCreate,
  onSave,
}: {
  objectives: RhLifeProjectObjective[];
  canEdit: boolean;
  isAdmin: boolean;
  saving: boolean;
  onCreate: (input: { title: string; forecast_date: string }) => Promise<boolean>;
  onSave: (objective: RhLifeProjectObjective, changes: ObjectiveChanges) => void;
}) {
  const [title, setTitle] = useState("");
  const [forecastDate, setForecastDate] = useState("");

  async function submitObjective(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await onCreate({ title, forecast_date: forecastDate })) {
      setTitle("");
      setForecastDate("");
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">Objetivos</h3>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Cada objetivo reúne prazo, conclusão e observações do colaborador e do RH.
          </p>
        </div>
        <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">
          {objectives.length} {objectives.length === 1 ? "objetivo" : "objetivos"}
        </span>
      </header>

      {objectives.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-200 px-4 py-6 text-center dark:border-gray-700">
          <Target className="mx-auto h-5 w-5 text-gray-400" />
          <p className="mt-2 text-sm font-medium text-gray-700 dark:text-gray-200">Nenhum objetivo cadastrado</p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">O progresso permanece em 0% até o primeiro objetivo.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {objectives.map((objective) => (
            <ObjectiveCard
              key={objective.id}
              objective={objective}
              canEdit={canEdit}
              isAdmin={isAdmin}
              saving={saving}
              onSave={(changes) => onSave(objective, changes)}
            />
          ))}
        </div>
      )}

      {canEdit ? (
        <form onSubmit={submitObjective} className="grid gap-3 rounded-lg border border-blue-100 bg-blue-50/50 p-4 dark:border-blue-900/50 dark:bg-blue-950/10 md:grid-cols-[minmax(0,1fr)_180px_auto]">
          <label>
            <span className={labelClass}>Novo objetivo</span>
            <input className={inputClass} value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={240} placeholder="Ex.: concluir uma formação" />
          </label>
          <label>
            <span className={labelClass}>Previsão</span>
            <input className={inputClass} type="date" value={forecastDate} onChange={(event) => setForecastDate(event.target.value)} />
          </label>
          <button type="submit" disabled={saving} className="inline-flex h-10 self-end items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50">
            {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Adicionar
          </button>
        </form>
      ) : null}
    </section>
  );
}

function ObjectiveCard({
  objective,
  canEdit,
  isAdmin,
  saving,
  onSave,
}: {
  objective: RhLifeProjectObjective;
  canEdit: boolean;
  isAdmin: boolean;
  saving: boolean;
  onSave: (changes: ObjectiveChanges) => void;
}) {
  const [draft, setDraft] = useState(() => objectiveDraft(objective));
  useEffect(() => setDraft(objectiveDraft(objective)), [objective]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave({
      title: draft.title,
      forecast_date: draft.forecast_date || null,
      employee_observations: draft.employee_observations,
      ...(isAdmin
        ? {
            status: draft.status,
            completed_at: draft.completed_at || null,
            rh_observations: draft.rh_observations,
          }
        : {}),
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-gray-200 p-4 dark:border-gray-700">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(objective.status)}`}>
          {OBJECTIVE_STATUS_LABELS[objective.status]}
        </span>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {objective.forecast_date ? `Previsão ${dateInputValue(objective.forecast_date)}` : "Sem previsão definida"}
          {objective.completed_at ? ` · Concluído ${dateInputValue(objective.completed_at)}` : ""}
        </span>
      </div>

      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
        <label>
          <span className={labelClass}>Objetivo</span>
          <input className={inputClass} value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} disabled={!canEdit} required maxLength={240} />
        </label>
        <label>
          <span className={labelClass}>Previsão</span>
          <input className={inputClass} type="date" value={draft.forecast_date} onChange={(event) => setDraft((current) => ({ ...current, forecast_date: event.target.value }))} disabled={!canEdit} />
        </label>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label>
          <span className={labelClass}>Observações do colaborador</span>
          <textarea className={inputClass} rows={3} value={draft.employee_observations} onChange={(event) => setDraft((current) => ({ ...current, employee_observations: event.target.value }))} disabled={!canEdit} maxLength={5000} />
        </label>
        <label>
          <span className={labelClass}>Observações do RH</span>
          <textarea className={inputClass} rows={3} value={draft.rh_observations} onChange={(event) => setDraft((current) => ({ ...current, rh_observations: event.target.value }))} disabled={!isAdmin} maxLength={5000} />
        </label>
      </div>

      {isAdmin ? (
        <div className="grid gap-3 md:grid-cols-[180px_180px]">
          <label>
            <span className={labelClass}>Estado</span>
            <select className={inputClass} value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value as RhLifeObjectiveStatus }))}>
              {Object.entries(OBJECTIVE_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>
            <span className={labelClass}>Conclusão</span>
            <input className={inputClass} type="date" value={draft.completed_at} onChange={(event) => setDraft((current) => ({ ...current, completed_at: event.target.value }))} />
          </label>
        </div>
      ) : null}

      {canEdit ? (
        <div className="flex justify-end">
          <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-lg border border-blue-200 px-3.5 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-50 disabled:opacity-50 dark:border-blue-900 dark:text-blue-300 dark:hover:bg-blue-900/20">
            {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar objetivo
          </button>
        </div>
      ) : null}
    </form>
  );
}

function objectiveDraft(objective: RhLifeProjectObjective) {
  return {
    title: objective.title,
    forecast_date: dateInputValue(objective.forecast_date),
    completed_at: dateInputValue(objective.completed_at),
    status: objective.status,
    rh_observations: objective.rh_observations,
    employee_observations: objective.employee_observations,
  };
}

function statusClass(status: RhLifeObjectiveStatus): string {
  if (status === "Realized") return "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300";
  if (status === "Discontinued") return "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300";
  return "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300";
}
