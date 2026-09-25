import { useEffect, useMemo, useState } from "react";
import { toast } from "@shared/services/toast";

import { formatTimeInput, isValidTimeInput } from "@shared/utils/inputFormatting";

import { useCreateOrUpdateRhPointConfigMutation } from "../hooks/useRhPoint";
import type { RhPointConfig } from "../types";

interface RhPointConfigCardProps {
  config: RhPointConfig | null;
  isLoading: boolean;
  hasError: boolean;
  canManagePoint: boolean;
  selectedUserId: string;
  targetUserLabel: string;
}

interface RhPointConfigFormState {
  startTime: string;
  lunchBreak: string;
  lunchReturn: string;
  endTime: string;
  workDays: string[];
}

const DEFAULT_START_TIME = "08:00";
const DEFAULT_LUNCH_BREAK = "12:00";
const DEFAULT_LUNCH_RETURN = "13:00";
const DEFAULT_END_TIME = "17:00";
const DEFAULT_WORK_DAYS = ["1", "2", "3", "4", "5"];

const WORK_DAY_OPTIONS = [
  { value: "1", label: "Seg" },
  { value: "2", label: "Ter" },
  { value: "3", label: "Qua" },
  { value: "4", label: "Qui" },
  { value: "5", label: "Sex" },
  { value: "6", label: "Sab" },
  { value: "7", label: "Dom" },
];

function formatTimeValue(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function parseWorkDays(value: string | null | undefined) {
  if (!value?.trim()) {
    return [...DEFAULT_WORK_DAYS];
  }

  const days = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return days.length > 0 ? days : [...DEFAULT_WORK_DAYS];
}

function buildFormState(config: RhPointConfig | null): RhPointConfigFormState {
  return {
    startTime: formatTimeValue(config?.start_time) || DEFAULT_START_TIME,
    lunchBreak: formatTimeValue(config?.lunch_break) || DEFAULT_LUNCH_BREAK,
    lunchReturn: formatTimeValue(config?.lunch_return) || DEFAULT_LUNCH_RETURN,
    endTime: formatTimeValue(config?.end_time) || DEFAULT_END_TIME,
    workDays: parseWorkDays(config?.work_days),
  };
}

function getWorkDaysSummary(workDays: string[]) {
  const labels = WORK_DAY_OPTIONS.filter((option) => workDays.includes(option.value)).map(
    (option) => option.label,
  );

  return labels.length > 0 ? labels.join(", ") : "Nenhum dia definido";
}

function ReadOnlyValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 dark:border-gray-700 dark:bg-gray-900/30">
      <p className="text-xs uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400">
        {label}
      </p>
      <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">{value || "-"}</p>
    </div>
  );
}

export function RhPointConfigCard({
  config,
  isLoading,
  hasError,
  canManagePoint,
  selectedUserId,
  targetUserLabel,
}: RhPointConfigCardProps) {
  const saveMutation = useCreateOrUpdateRhPointConfigMutation();
  const [formState, setFormState] = useState<RhPointConfigFormState>(() => buildFormState(config));

  useEffect(() => {
    setFormState(buildFormState(config));
  }, [config?.id, selectedUserId]);

  const isEditingAnotherUser = canManagePoint && Boolean(selectedUserId);
  const description = canManagePoint
    ? isEditingAnotherUser
      ? `Defina a jornada de trabalho usada para calcular o ponto de ${targetUserLabel}.`
      : "Defina a jornada de trabalho usada para cálculo do ponto."
    : "Sua jornada é definida pelo RH e exibida aqui apenas para consulta.";

  const workDaysSummary = useMemo(() => getWorkDaysSummary(formState.workDays), [formState.workDays]);
  const readOnlyStartTime = formatTimeValue(config?.start_time);
  const readOnlyLunchBreak = formatTimeValue(config?.lunch_break);
  const readOnlyLunchReturn = formatTimeValue(config?.lunch_return);
  const readOnlyEndTime = formatTimeValue(config?.end_time);
  const readOnlyWorkDaysSummary = config
    ? getWorkDaysSummary(parseWorkDays(config.work_days))
    : "Aguardando definição do RH";

  function handleTimeChange<
    K extends "startTime" | "lunchBreak" | "lunchReturn" | "endTime",
  >(key: K, value: RhPointConfigFormState[K]) {
    setFormState((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function handleWorkDayToggle(day: string) {
    setFormState((current) => {
      const exists = current.workDays.includes(day);

      return {
        ...current,
        workDays: exists
          ? current.workDays.filter((value) => value !== day)
          : [...current.workDays, day].sort(),
      };
    });
  }

  async function handleSubmit() {
    if (!canManagePoint) {
      return;
    }

    if (
      !formState.startTime ||
      !formState.lunchBreak ||
      !formState.lunchReturn ||
      !formState.endTime
    ) {
      toast.warn("Preencha todos os horários da jornada.");
      return;
    }

    if (
      ![formState.startTime, formState.lunchBreak, formState.lunchReturn, formState.endTime].every(
        isValidTimeInput,
      )
    ) {
      toast.warn("Informe os horários no formato 24h (HH:MM).");
      return;
    }

    if (formState.workDays.length === 0) {
      toast.warn("Selecione ao menos um dia útil.");
      return;
    }

    try {
      await saveMutation.mutateAsync({
        target_user_id: isEditingAnotherUser ? selectedUserId : undefined,
        start_time: formState.startTime,
        lunch_break: formState.lunchBreak,
        lunch_return: formState.lunchReturn,
        end_time: formState.endTime,
        work_days: formState.workDays.join(","),
      });

      toast.success("Configuração de ponto salva com sucesso.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Não foi possível salvar a configuração de ponto.";
      toast.error(message);
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">
            Jornada do colaborador
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">{description}</p>
        </div>
        <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700 dark:bg-gray-700 dark:text-gray-300">
          {targetUserLabel}
        </span>
      </div>

      {hasError ? (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/10 dark:text-red-300">
          Não foi possível carregar a configuração de jornada.
        </div>
      ) : null}

      {!isLoading && !hasError && !config ? (
        <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-4 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/10 dark:text-amber-200">
          {canManagePoint
            ? "Nenhuma jornada foi cadastrada ainda. Preenchemos uma sugestão padrão para você salvar ou ajustar."
            : "Sua jornada ainda não foi definida pelo RH."}
        </div>
      ) : null}

      {canManagePoint ? (
        <>
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <label className="flex flex-col gap-2 text-sm text-gray-700 dark:text-gray-300">
              <span>Entrada</span>
              <input
                type="text"
                inputMode="numeric"
                placeholder="HH:MM"
                maxLength={5}
                value={formState.startTime}
                onChange={(event) => handleTimeChange("startTime", formatTimeInput(event.target.value))}
                disabled={isLoading || saveMutation.isPending}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              />
            </label>

            <label className="flex flex-col gap-2 text-sm text-gray-700 dark:text-gray-300">
              <span>Saída almoço</span>
              <input
                type="text"
                inputMode="numeric"
                placeholder="HH:MM"
                maxLength={5}
                value={formState.lunchBreak}
                onChange={(event) => handleTimeChange("lunchBreak", formatTimeInput(event.target.value))}
                disabled={isLoading || saveMutation.isPending}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              />
            </label>

            <label className="flex flex-col gap-2 text-sm text-gray-700 dark:text-gray-300">
              <span>Volta almoço</span>
              <input
                type="text"
                inputMode="numeric"
                placeholder="HH:MM"
                maxLength={5}
                value={formState.lunchReturn}
                onChange={(event) => handleTimeChange("lunchReturn", formatTimeInput(event.target.value))}
                disabled={isLoading || saveMutation.isPending}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              />
            </label>

            <label className="flex flex-col gap-2 text-sm text-gray-700 dark:text-gray-300">
              <span>Saída</span>
              <input
                type="text"
                inputMode="numeric"
                placeholder="HH:MM"
                maxLength={5}
                value={formState.endTime}
                onChange={(event) => handleTimeChange("endTime", formatTimeInput(event.target.value))}
                disabled={isLoading || saveMutation.isPending}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              />
            </label>
          </div>

          <div className="mt-4 rounded-lg border border-dashed border-gray-300 px-4 py-4 dark:border-gray-700">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">Dias de trabalho</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">{workDaysSummary}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {WORK_DAY_OPTIONS.map((option) => {
                  const checked = formState.workDays.includes(option.value);

                  return (
                    <label
                      key={option.value}
                      className={`inline-flex cursor-pointer items-center rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                        checked
                          ? "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-300"
                          : "border-gray-300 text-gray-600 dark:border-gray-600 dark:text-gray-300"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => handleWorkDayToggle(option.value)}
                        disabled={isLoading || saveMutation.isPending}
                        className="sr-only"
                      />
                      {option.label}
                    </label>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isLoading || hasError || saveMutation.isPending}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saveMutation.isPending ? "Salvando..." : "Salvar configuração"}
            </button>
          </div>
        </>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <ReadOnlyValue label="Entrada" value={readOnlyStartTime} />
            <ReadOnlyValue label="Saída almoço" value={readOnlyLunchBreak} />
            <ReadOnlyValue label="Volta almoço" value={readOnlyLunchReturn} />
            <ReadOnlyValue label="Saída" value={readOnlyEndTime} />
          </div>

          <div className="rounded-lg border border-dashed border-gray-300 px-4 py-4 dark:border-gray-700">
            <p className="text-sm font-medium text-gray-900 dark:text-white">Dias de trabalho</p>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              {readOnlyWorkDaysSummary}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
