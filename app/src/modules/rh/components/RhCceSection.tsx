import { useMemo, useState } from "react";
import { AlertCircle, CalendarDays, CheckCircle2, Loader2, Star } from "lucide-react";

import { useRhPermissions } from "../hooks/useRhPermissions";
import {
  useConfigureRhCceFloors,
  useCreateRhCceCycle,
  useRhCceCycles,
  useRhCceFloors,
  useUpdateRhCceWeek,
} from "../hooks/useRhCce";
import { useAssignableUsers } from "../hooks/useAssignableUsers";
import type { CceOccurrences, CceWeeklyEvaluation } from "../types";

const OCCURRENCES: { key: keyof CceOccurrences; label: string; weight: number }[] = [
  { key: "organization", label: "Organização", weight: 1 },
  { key: "cleanliness", label: "Limpeza", weight: 1 },
  { key: "delays", label: "Atrasos", weight: 2 },
  { key: "cellphone", label: "Uso de celular", weight: 2 },
  { key: "conversations", label: "Conversas fora de hora", weight: 1 },
  { key: "demands", label: "Atendimento às demandas", weight: 1 },
  { key: "dress_code", label: "Uniforme e apresentação", weight: 1 },
];

const EMPTY_OCCURRENCES: CceOccurrences = {
  organization: false,
  cleanliness: false,
  delays: false,
  cellphone: false,
  conversations: false,
  demands: false,
  dress_code: false,
};

const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function todayAsLocalInputValue() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatCceDate(value: string) {
  const date = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function RhCceSection() {
  const { canManageRh } = useRhPermissions("cce");
  const floors = useRhCceFloors();
  const cycles = useRhCceCycles();
  const users = useAssignableUsers({ module: "rh" });
  const configureFloors = useConfigureRhCceFloors();
  const createCycle = useCreateRhCceCycle();
  const saveWeek = useUpdateRhCceWeek();
  const [floorCount, setFloorCount] = useState<number | null>(null);
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const configuredCount = floorCount ?? floors.data?.floor_count ?? 4;
  const existingCycle = useMemo(
    () => cycles.data?.find((cycle) => cycle.year === year && cycle.month === month),
    [cycles.data, month, year],
  );
  const error = floors.error ?? cycles.error ?? users.error ?? configureFloors.error ?? createCycle.error ?? saveWeek.error;

  async function handleConfigureFloors() {
    await configureFloors.mutateAsync(configuredCount);
    setFloorCount(null);
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
            <Star aria-hidden="true" className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">CCE · 5 Estrelas</h2>
            <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-400">
              Acompanhe as avaliações semanais por piso. Cada item soma de 1 a 2 pontos; a semana pode totalizar até 9.
            </p>
          </div>
        </div>
      </section>

      {error ? (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/10 dark:text-red-300">
          <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error.message || "Não foi possível concluir a operação do CCE."}</span>
        </div>
      ) : null}

      {canManageRh ? (
        <section aria-labelledby="cce-cycle-title" className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <h3 id="cce-cycle-title" className="text-lg font-semibold text-gray-900 dark:text-white">Configurar ciclo</h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Mês
              <select value={month} onChange={(event) => setMonth(Number(event.target.value))} className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-gray-600 dark:bg-gray-900 dark:text-white">
                {MONTHS.map((label, index) => <option key={label} value={index + 1}>{label}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Ano
              <input type="number" min={1} max={9999} value={year} onChange={(event) => setYear(Number(event.target.value))} className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-gray-600 dark:bg-gray-900 dark:text-white" />
            </label>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Quantidade de pisos (0–4)
              <select value={configuredCount} onChange={(event) => setFloorCount(Number(event.target.value))} className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-gray-600 dark:bg-gray-900 dark:text-white">
                {[0, 1, 2, 3, 4].map((count) => <option key={count} value={count}>{count}</option>)}
              </select>
              <span className="mt-1 block text-xs font-normal text-gray-500 dark:text-gray-400">O ciclo mantém a seleção histórica dos pisos 0 a 3.</span>
            </label>
            <div className="flex flex-wrap items-end gap-2">
              <button type="button" disabled={configureFloors.isPending || floors.isLoading || floorCount === null} onClick={handleConfigureFloors} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700">
                {configureFloors.isPending ? "Salvando…" : "Salvar pisos"}
              </button>
              <button type="button" disabled={createCycle.isPending || cycles.isLoading || Boolean(existingCycle) || floorCount !== null || !Number.isInteger(year) || year < 1 || year > 9999} onClick={() => createCycle.mutate({ year, month })} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
                <CalendarDays aria-hidden="true" className="h-4 w-4" />
                {existingCycle ? "Ciclo criado" : createCycle.isPending ? "Criando…" : "Criar ciclo"}
              </button>
            </div>
          </div>
        </section>
      ) : null}

      <section aria-label="Ciclos CCE" className="space-y-4">
        {cycles.isLoading ? (
          <div role="status" className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white p-5 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"><Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />Carregando ciclos…</div>
        ) : cycles.data?.length ? cycles.data.map((cycle) => (
          <article key={cycle.id} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{MONTHS[cycle.month - 1]} {cycle.year}</h3>
            <div className="mt-4 grid gap-4 xl:grid-cols-2">
              {cycle.weekly_evaluations.map((evaluation) => (
                <CceWeekCard key={evaluation.id} cycleId={cycle.id} evaluation={evaluation} canManage={canManageRh} users={users.data ?? []} isSaving={saveWeek.isPending} onSave={(payload) => saveWeek.mutate(payload)} />
              ))}
              {cycle.weekly_evaluations.length === 0 ? <p className="text-sm text-gray-600 dark:text-gray-400">Este ciclo não tem pisos configurados.</p> : null}
            </div>
          </article>
        )) : (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center dark:border-gray-700 dark:bg-gray-800">
            <CalendarDays aria-hidden="true" className="mx-auto h-8 w-8 text-gray-400" />
            <h3 className="mt-3 font-semibold text-gray-900 dark:text-white">Nenhum ciclo CCE criado</h3>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{canManageRh ? `Selecione ${MONTHS[month - 1]} ${year} e crie o ciclo para começar.` : "Quando a gestão criar um ciclo, as avaliações aparecerão aqui."}</p>
          </div>
        )}
      </section>
    </div>
  );
}

function CceWeekCard({
  cycleId,
  evaluation,
  canManage,
  users,
  isSaving,
  onSave,
}: {
  cycleId: string;
  evaluation: CceWeeklyEvaluation;
  canManage: boolean;
  users: { id: string; name: string }[];
  isSaving: boolean;
  onSave: (payload: { id: string; monitor_user_id: string; evaluated_at: string; occurrences: CceOccurrences }) => void;
}) {
  const [occurrences, setOccurrences] = useState<CceOccurrences>(() => ({
    organization: evaluation.organization,
    cleanliness: evaluation.cleanliness,
    delays: evaluation.delays,
    cellphone: evaluation.cellphone,
    conversations: evaluation.conversations,
    demands: evaluation.demands,
    dress_code: evaluation.dress_code,
  }));
  const [monitorId, setMonitorId] = useState(evaluation.monitor_user_id ?? "");
  const [evaluatedAt, setEvaluatedAt] = useState(evaluation.evaluated_at?.slice(0, 10) ?? todayAsLocalInputValue());
  const completed = Boolean(evaluation.completed_at);
  const total = OCCURRENCES.reduce((sum, item) => sum + (occurrences[item.key] ? item.weight : 0), 0);
  const titleId = `cce-${cycleId}-floor-${evaluation.floor}-week-${evaluation.week}`;

  return (
    <section aria-labelledby={titleId} className="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 id={titleId} className="font-semibold text-gray-900 dark:text-white">Piso {evaluation.floor} · Semana {evaluation.week}</h4>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{completed ? `Avaliado por ${evaluation.monitor?.name ?? "monitor"}` : "Avaliação pendente"}{evaluation.evaluated_at ? ` · ${formatCceDate(evaluation.evaluated_at)}` : ""}</p>
        </div>
        <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">{completed ? evaluation.total : total}/9</span>
      </div>
      <fieldset disabled={!canManage || completed} className="mt-4 space-y-2 disabled:opacity-80">
        <legend className="sr-only">Ocorrências do piso {evaluation.floor}, semana {evaluation.week}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {OCCURRENCES.map((item) => (
            <label key={item.key} className="flex min-h-10 items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700 dark:bg-gray-900/50 dark:text-gray-300">
              <input type="checkbox" checked={occurrences[item.key]} onChange={(event) => setOccurrences((current) => ({ ...current, [item.key]: event.target.checked }))} className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
              <span>{item.label} <span className="text-xs text-gray-500">(+{item.weight})</span></span>
            </label>
          ))}
        </div>
        {canManage && !completed ? (
          <div className="grid gap-3 pt-2 sm:grid-cols-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Monitor
              <select required value={monitorId} onChange={(event) => setMonitorId(event.target.value)} className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 dark:border-gray-600 dark:bg-gray-900 dark:text-white">
                <option value="">Selecione um monitor</option>
                {users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Data da avaliação
              <input type="date" required value={evaluatedAt} onChange={(event) => setEvaluatedAt(event.target.value)} className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 dark:border-gray-600 dark:bg-gray-900 dark:text-white" />
            </label>
          </div>
        ) : null}
      </fieldset>
      {canManage && !completed ? (
        <div className="mt-4 flex justify-end">
          <button type="button" disabled={!monitorId || !evaluatedAt || isSaving} onClick={() => onSave({ id: evaluation.id, monitor_user_id: monitorId, evaluated_at: evaluatedAt, occurrences })} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
            {isSaving ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <CheckCircle2 aria-hidden="true" className="h-4 w-4" />}
            Registrar avaliação
          </button>
        </div>
      ) : null}
    </section>
  );
}
