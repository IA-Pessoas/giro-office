import type { ProjectWizardTask, ProjectWizardTaskProposal, TaskModel } from "../types";
import { getAutomaticTaskResponsibleId } from "./taskFormModalUi.ts";

export const WIZARD_TASK_DATE_OUTSIDE_PERIOD_WARNING = "Prazo fora do período do projeto.";
export const WIZARD_EXTRACTION_MAX_ATTEMPTS = 3;
export const WIZARD_EXTRACTION_MAX_SOURCE_BYTES = 10 * 1024 * 1024;

type ProjectWizardCrypto = Pick<Crypto, "getRandomValues"> &
  Partial<Pick<Crypto, "randomUUID">>;

export function createProjectWizardId(
  cryptoApi: ProjectWizardCrypto = globalThis.crypto,
): string {
  if (typeof cryptoApi.randomUUID === "function") return cryptoApi.randomUUID();

  const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}

const WIZARD_EXTRACTION_FILE_MIME_TYPES: Record<string, readonly string[]> = {
  ".txt": ["text/plain"],
  ".md": ["text/markdown", "text/plain", "text/x-markdown"],
  ".docx": ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  ".pdf": ["application/pdf"],
};

export function canAttemptWizardExtraction(consumedAttempts: number): boolean {
  return (
    Number.isInteger(consumedAttempts) &&
    consumedAttempts >= 0 &&
    consumedAttempts < WIZARD_EXTRACTION_MAX_ATTEMPTS
  );
}

export const WIZARD_EXTRACTION_UNAVAILABLE_MESSAGE = "Extração por IA indisponível no momento.";
// Mesmo code do task-service Worker quando a extração não está configurada.
export const WIZARD_EXTRACTION_UNAVAILABLE_CODE = "AI_EXTRACTION_UNAVAILABLE";

// Gasta tentativa o que chegou ao provedor: 422 (IA não achou tarefas) e 502 (erro ou timeout
// do provedor). Sem resposta também gasta, porque a chamada pode ter chegado. 4xx de validação,
// 500 e 503 vêm antes da chamada.
// ponytail: 502 do gateway (upstream fora) também gasta; separar exige code do worker no 502.
export function wizardExtractionConsumesAttempt(status: number | undefined): boolean {
  return status === undefined || status === 422 || status === 502;
}

interface WizardExtractionSourceValidationInput {
  text?: string;
  file?: Pick<File, "name" | "size" | "type"> | null;
}

export function getWizardExtractionSourceValidationMessage({
  text = "",
  file = null,
}: WizardExtractionSourceValidationInput): string | null {
  if (file) {
    if (file.size === 0) return "O arquivo da Ata é obrigatório e não pode estar vazio.";
    if (file.size > WIZARD_EXTRACTION_MAX_SOURCE_BYTES) {
      return "Arquivo excede o limite de 10 MB.";
    }

    const dotIndex = file.name.lastIndexOf(".");
    const extension = dotIndex > 0 ? file.name.slice(dotIndex).toLowerCase() : "";
    if (!WIZARD_EXTRACTION_FILE_MIME_TYPES[extension]?.includes(file.type)) {
      return "Tipo de arquivo não permitido.";
    }

    return null;
  }

  if (!text.trim()) return "Informe o texto ou selecione um arquivo da Ata.";
  if (new TextEncoder().encode(text).byteLength > WIZARD_EXTRACTION_MAX_SOURCE_BYTES) {
    return "A Ata deve ter no máximo 10 MB.";
  }

  return null;
}

/**
 * Trocar departamento ou Modelo derruba as seleções que deixaram de ser compatíveis; editar o
 * prazo derruba o aviso da IA sobre ele.
 */
export function applyWizardTaskChange<T extends ProjectWizardTaskProposal>(
  task: T,
  field: keyof ProjectWizardTask,
  value: string,
  taskModels: TaskModel[],
): T {
  if (field === "department_id") {
    return { ...task, department_id: value, model_id: "", responsible_id: null };
  }

  if (field === "model_id") {
    const model = taskModels.find(
      (item) => item.id === value && item.department_id === task.department_id,
    );
    return {
      ...task,
      model_id: value,
      responsible_id:
        getAutomaticTaskResponsibleId(model?.responsible_id, model?.department?.users ?? []) || null,
    };
  }

  if (field === "prevision_date") {
    return { ...task, prevision_date: value || undefined, prevision_date_warning: undefined };
  }

  return { ...task, [field]: value };
}

/** Aviso do prazo: o da IA enquanto o campo está vazio, o do período assim que ele é preenchido. */
export function getWizardTaskDateWarning(
  task: Pick<ProjectWizardTaskProposal, "prevision_date" | "prevision_date_warning">,
  startDate: string,
  endDate?: string | null,
): string | null {
  if (!task.prevision_date) return task.prevision_date_warning ?? null;

  return task.prevision_date < startDate || (endDate ? task.prevision_date > endDate : false)
    ? WIZARD_TASK_DATE_OUTSIDE_PERIOD_WARNING
    : null;
}

export function getProjectWizardSuccessMessage(counts: {
  main: number;
  dependencies: number;
  unassigned: number;
}): string {
  const total = counts.main + counts.dependencies;
  const unassigned = counts.unassigned > 0 ? ` ${counts.unassigned} ainda sem responsável.` : "";
  return `Projeto criado com ${total} ${total === 1 ? "tarefa" : "tarefas"}.${unassigned}`;
}
