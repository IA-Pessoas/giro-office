import { useEffect, useRef, useState } from "react";
import { CalendarDays, FileText, LoaderCircle, Save } from "lucide-react";
import { useRouter } from "next/router";
import { toast } from "react-toastify";

import { ClientSelectionField } from "@modules/clients";
import { Dialog } from "@shared/components/ui/Dialog";
import { RequiredFieldLabel } from "@shared/components/RequiredFieldLabel";

import { useProjectForm } from "../hooks/useProjectForm";
import {
  useCreateProjectWizardMutation,
  useProjectDetail,
  useUpdateProjectMutation,
} from "../hooks/useProjects";
import type { ProjectDetail } from "../types";
import {
  PROJECT_INPUT_CLASSNAME,
  PROJECT_PRIMARY_BUTTON_CLASSNAME,
  PROJECT_SECONDARY_BUTTON_CLASSNAME,
} from "./projectUi";

interface ProjectFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string | null;
  projectId?: string | null;
  onSuccess?: (project: ProjectDetail | { id: string; client_id?: string }) => void;
}

export function ProjectFormModal({
  open,
  onOpenChange,
  clientId,
  projectId,
  onSuccess,
}: ProjectFormModalProps) {
  const router = useRouter();
  const isEditing = Boolean(projectId);
  const detailQuery = useProjectDetail(open && projectId ? projectId : undefined);
  const createWizardMutation = useCreateProjectWizardMutation();
  const updateMutation = useUpdateProjectMutation();
  const [createStep, setCreateStep] = useState<1 | 2 | 3>(1);
  const idempotencyKeyRef = useRef<string | null>(null);
  const { values, updateValue, validate, reset, buildCreatePayload, buildUpdatePayload } =
    useProjectForm(detailQuery.data);

  useEffect(() => {
    if (!open) {
      reset(null);
      setCreateStep(1);
      idempotencyKeyRef.current = null;
    } else if (!isEditing && !idempotencyKeyRef.current) {
      idempotencyKeyRef.current = crypto.randomUUID();
    }
  }, [isEditing, open, reset]);

  const isSaving = createWizardMutation.isPending || updateMutation.isPending;

  async function handleDirectSubmit() {
    if (isEditing && !detailQuery.data) {
      toast.error("Carregue o projeto antes de tentar editar.");
      return;
    }

    const validationError = validate();

    if (validationError) {
      toast.error(validationError);
      return;
    }

    try {
      if (isEditing && projectId && detailQuery.data) {
        const updatedProject = await updateMutation.mutateAsync({
          ...buildUpdatePayload(projectId),
          clientId: detailQuery.data.client_id,
        });

        toast.success("Projeto atualizado com sucesso.");
        onSuccess?.(updatedProject);
      }

      onOpenChange(false);
    } catch (error) {
      const message =
        typeof error === "object" &&
        error !== null &&
        "response" in error &&
        typeof (error as { response?: { data?: { error?: string } } }).response?.data?.error ===
          "string"
          ? (error as { response?: { data?: { error?: string } } }).response?.data?.error
          : "Não foi possível salvar o projeto.";

      toast.error(message);
    }
  }

  function handleCreateStepOne() {
    const validationError = validate();

    if (validationError) {
      toast.error(validationError);
      return;
    }

    setCreateStep(2);
  }

  async function handleWizardSubmit() {
    if (!clientId || !idempotencyKeyRef.current) {
      return;
    }

    try {
      const result = await createWizardMutation.mutateAsync({
        ...buildCreatePayload(clientId),
        idempotencyKey: idempotencyKeyRef.current,
      });
      toast.success("Projeto criado com sucesso.");
      onSuccess?.(result.project);
      onOpenChange(false);
      await router.push(`/tasks?clientId=${clientId}`);
    } catch (error) {
      const message =
        typeof error === "object" &&
        error !== null &&
        "response" in error &&
        typeof (error as { response?: { data?: { error?: string } } }).response?.data?.error ===
          "string"
          ? (error as { response?: { data?: { error?: string } } }).response?.data?.error
          : "Não foi possível salvar o projeto.";

      toast.error(message);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEditing ? "Editar projeto" : "Novo projeto"}
      description={isEditing ? "Formulário de projeto" : `Etapa ${createStep} de 3`}
      contentClassName="w-[min(92vw,760px)]"
      footer={
        <>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className={PROJECT_SECONDARY_BUTTON_CLASSNAME}
            disabled={isSaving}
          >
            Cancelar
          </button>
          {isEditing ? (
            <button
              type="button"
              onClick={() => void handleDirectSubmit()}
              className={PROJECT_PRIMARY_BUTTON_CLASSNAME}
              disabled={isSaving || !detailQuery.data}
            >
              {isSaving ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Salvar alterações
            </button>
          ) : createStep === 1 ? (
            <button
              type="button"
              onClick={handleCreateStepOne}
              className={PROJECT_PRIMARY_BUTTON_CLASSNAME}
              disabled={isSaving || !clientId}
            >
              Continuar
            </button>
          ) : createStep === 2 ? (
            <>
              <button
                type="button"
                onClick={() => setCreateStep(1)}
                className={PROJECT_SECONDARY_BUTTON_CLASSNAME}
                disabled={isSaving}
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={() => setCreateStep(3)}
                className={PROJECT_PRIMARY_BUTTON_CLASSNAME}
                disabled={isSaving}
              >
                Pular e revisar
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setCreateStep(1)}
                className={PROJECT_SECONDARY_BUTTON_CLASSNAME}
                disabled={isSaving}
              >
                Voltar para etapa 1
              </button>
              <button
                type="button"
                onClick={() => void handleWizardSubmit()}
                className={PROJECT_PRIMARY_BUTTON_CLASSNAME}
                disabled={isSaving || !clientId}
              >
                {isSaving ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Criar projeto
              </button>
            </>
          )}
        </>
      }
    >
      {isEditing && detailQuery.isLoading ? (
        <div className="flex min-h-52 items-center justify-center text-sm text-slate-500 dark:text-slate-400">
          <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
          Carregando projeto...
        </div>
      ) : detailQuery.isError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300">
          Não foi possível carregar os dados do projeto para edição.
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (isEditing) {
              void handleDirectSubmit();
            } else {
              handleCreateStepOne();
            }
          }}
        >
          {!isEditing && createStep === 1 ? (
            <div className="space-y-2">
              <span className="text-sm font-medium text-slate-700 dark:text-white">Cliente</span>
              <ClientSelectionField clientId={clientId} />
            </div>
          ) : null}

          {isEditing || createStep === 1 ? (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <RequiredFieldLabel
                    className="text-sm font-medium text-slate-700 dark:text-white"
                    required
                  >
                    Nome
                  </RequiredFieldLabel>
                  <input
                    type="text"
                    value={values.name}
                    onChange={(event) => updateValue("name", event.target.value)}
                    className={PROJECT_INPUT_CLASSNAME}
                    placeholder="Ex.: Implantação fiscal"
                    aria-required="true"
                  />
                </label>

                <label className="space-y-2">
                  <RequiredFieldLabel
                    className="text-sm font-medium text-slate-700 dark:text-white"
                    required
                  >
                    Data de início
                  </RequiredFieldLabel>
                  <div className="relative">
                    <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="date"
                      value={values.start_date}
                      onChange={(event) => updateValue("start_date", event.target.value)}
                      onInput={(event) => updateValue("start_date", event.currentTarget.value)}
                      className={`${PROJECT_INPUT_CLASSNAME} pl-10`}
                      aria-required="true"
                    />
                  </div>
                </label>
              </div>

              <label className="space-y-2">
                <span className="text-sm font-medium text-slate-700 dark:text-white">
                  Data final prevista
                </span>
                <div className="relative">
                  <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="date"
                    value={values.end_date}
                    onChange={(event) => updateValue("end_date", event.target.value)}
                    onInput={(event) => updateValue("end_date", event.currentTarget.value)}
                    className={`${PROJECT_INPUT_CLASSNAME} pl-10`}
                  />
                </div>
              </label>

              <label className="space-y-2">
                <RequiredFieldLabel
                  className="text-sm font-medium text-slate-700 dark:text-white"
                  required
                >
                  Objetivo
                </RequiredFieldLabel>
                <div className="relative">
                  <FileText className="pointer-events-none absolute left-3 top-4 h-4 w-4 text-slate-400" />
                  <textarea
                    value={values.objective}
                    onChange={(event) => updateValue("objective", event.target.value)}
                    className={`${PROJECT_INPUT_CLASSNAME} min-h-32 resize-y pl-10`}
                    placeholder="Descreva o objetivo do projeto."
                    aria-required="true"
                  />
                </div>
              </label>
            </>
          ) : null}

          {!isEditing && createStep === 2 ? (
            <p className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-950/40 dark:text-slate-300">
              Nenhuma tarefa será criada nesta etapa.
            </p>
          ) : null}

          {!isEditing && createStep === 3 ? (
            <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-950/40 dark:text-slate-200">
              <h3 className="font-semibold text-slate-900 dark:text-white">Revisão</h3>
              <div>
                <span className="font-medium">Cliente:</span>
                <ClientSelectionField clientId={clientId} />
              </div>
              <p>
                <span className="font-medium">Nome:</span> {values.name}
              </p>
              <p>
                <span className="font-medium">Início:</span> {values.start_date}
              </p>
              {values.end_date ? (
                <p>
                  <span className="font-medium">Término:</span> {values.end_date}
                </p>
              ) : null}
              <p>
                <span className="font-medium">Objetivo:</span> {values.objective}
              </p>
            </div>
          ) : null}
        </form>
      )}
    </Dialog>
  );
}
