import { useEffect, useMemo, useState } from "react";
import { FileText, LoaderCircle, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "react-toastify";

import { departmentService, type DepItem } from "@modules/departments";
import { regularizeService } from "@modules/regularize";
import { useAssignableUsers } from "@modules/rh";
import { ConfirmationDialog } from "@shared/components";
import { Dialog } from "@shared/components/ui/Dialog";
import { RequiredFieldLabel } from "@shared/components/RequiredFieldLabel";

import { taskModelService } from "../services/taskModelService";
import { normalizeTaskModelResponsibleSequence } from "../services/taskModelService.contract";
import type {
  CreateTaskModelData,
  TaskDependent,
  TaskModel,
  TaskModelListItem,
  TaskIntegrationRegularize,
} from "../types";
import {
  PROJECT_COMPACT_DANGER_BUTTON_CLASSNAME,
  PROJECT_COMPACT_PRIMARY_BUTTON_CLASSNAME,
  PROJECT_INPUT_CLASSNAME,
  PROJECT_PRIMARY_BUTTON_CLASSNAME,
  PROJECT_SECONDARY_BUTTON_CLASSNAME,
  ProjectSelect,
  PROJECT_SUBPANEL_CLASSNAME,
} from "./projectUi";
import {
  TASK_FORM_AUXILIARY_WARNING_CLASSNAME,
  TASK_FORM_BODY_CLASSNAME,
  TASK_FORM_CONTENT_CLASSNAME,
  TASK_FORM_FORM_CLASSNAME,
  TASK_FORM_GRID_CLASSNAME,
  TASK_FORM_LABEL_CLASSNAME,
  TASK_FORM_TEXTAREA_CLASSNAME,
  TASK_FORM_THREE_COLUMN_GRID_CLASSNAME,
} from "./taskFormModalUi";

interface TaskModelModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialData?: TaskModel | null;
  onSave: (data: CreateTaskModelData & { id?: string }) => Promise<boolean>;
}

const EMPTY_FORM_DATA: CreateTaskModelData = {
  name: "",
  department_id: "",
  responsible_id: "",
  responsible2_id: "",
  responsible3_id: "",
  observations: "",
  billing: "Não Realizar",
  prevision: 0,
  type: "Projeto",
};

const BILLING_OPTIONS = ["Não Realizar", "Realizar"] as const;

function getApiErrorMessage(error: unknown, fallback: string) {
  if (
    typeof error === "object" &&
    error !== null &&
    "response" in error &&
    typeof (error as { response?: { data?: { error?: string; message?: string } } }).response?.data
      ?.error === "string"
  ) {
    return (error as { response?: { data?: { error?: string } } }).response?.data?.error ?? fallback;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "response" in error &&
    typeof (error as { response?: { data?: { message?: string } } }).response?.data?.message ===
      "string"
  ) {
    return (error as { response?: { data?: { message?: string } } }).response?.data?.message ?? fallback;
  }

  return fallback;
}

export function TaskModelModal({
  isOpen,
  onClose,
  initialData,
  onSave,
}: TaskModelModalProps) {
  const isEditing = Boolean(initialData?.id);
  const [formData, setFormData] = useState<CreateTaskModelData>(EMPTY_FORM_DATA);
  const [departments, setDepartments] = useState<DepItem[]>([]);
  const [allTasks, setAllTasks] = useState<TaskModelListItem[]>([]);
  const [dependents, setDependents] = useState<TaskDependent[]>([]);
  const [regularizeLinks, setRegularizeLinks] = useState<TaskIntegrationRegularize[]>([]);
  const [regularizeDestination, setRegularizeDestination] = useState("");
  const [regularizeType, setRegularizeType] = useState<"process" | "license">("process");
  const [regularizeOptions, setRegularizeOptions] = useState<
    Array<{ id: string; label: string; type: "process" | "license" }>
  >([]);
  const [newDependent, setNewDependent] = useState({
    dependent_id: "",
    wait: false,
    observation: "",
  });
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [loadingDependents, setLoadingDependents] = useState(false);
  const [pendingDependentDeletion, setPendingDependentDeletion] = useState<string | null>(null);
  const [dependentDeletionError, setDependentDeletionError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [detailError, setDetailError] = useState(false);
  const [optionsWarning, setOptionsWarning] = useState<string | null>(null);
  const usersQuery = useAssignableUsers({
    enabled: isOpen,
    // Sem filtro de módulo: o task-service aceita qualquer ativo do departamento como responsável.
    departmentId: formData.department_id || undefined,
  });
  const users = usersQuery.data ?? [];
  const [optionsRetryKey, setOptionsRetryKey] = useState(0);
  const [requiredOptionsWarning, setRequiredOptionsWarning] = useState(false);
  const [taskModelsWarning, setTaskModelsWarning] = useState(false);

  const availableDependentTasks = useMemo(
    () => allTasks.filter((task) => task.id !== initialData?.id),
    [allTasks, initialData?.id],
  );

  useEffect(() => {
    if (!isOpen) {
      setFormData(EMPTY_FORM_DATA);
      setDependents([]);
      setRegularizeLinks([]);
      setRegularizeDestination("");
      setNewDependent({ dependent_id: "", wait: false, observation: "" });
      setPendingDependentDeletion(null);
      setDependentDeletionError(null);
      setDetailError(false);
      setOptionsWarning(null);
      setOptionsRetryKey(0);
      setRequiredOptionsWarning(false);
      setTaskModelsWarning(false);
      return;
    }

    let cancelled = false;

    async function loadOptions() {
      setLoadingOptions(true);
      setOptionsWarning(null);
      setRequiredOptionsWarning(false);
      setTaskModelsWarning(false);

      const [departmentsResult, taskModelsResult] = await Promise.allSettled([
        departmentService.list({ status: "Ativo" }),
        taskModelService.list({ type: "Projeto" }),
      ]);

      if (cancelled) {
        return;
      }

      const failedLists: string[] = [];

      if (departmentsResult.status === "fulfilled") {
        setDepartments(departmentsResult.value);
      } else {
        setDepartments([]);
        setRequiredOptionsWarning(true);
        failedLists.push("departamentos");
      }

      if (taskModelsResult.status === "fulfilled") {
        setAllTasks(taskModelsResult.value);
      } else {
        setAllTasks([]);
        setTaskModelsWarning(true);
        failedLists.push("modelos");
      }

      setOptionsWarning(
        failedLists.length > 0
          ? `Não foi possível carregar ${failedLists.join(", ")}.`
          : null,
      );
      setLoadingOptions(false);
    }

    void loadOptions();

    return () => {
      cancelled = true;
    };
  }, [isOpen, optionsRetryKey]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let cancelled = false;

    async function loadModelDetail() {
      setDetailError(false);
      setNewDependent({ dependent_id: "", wait: false, observation: "" });

      if (!initialData?.id) {
        setFormData(EMPTY_FORM_DATA);
        setDependents([]);
        return;
      }

      setLoadingDetail(true);
      setLoadingDependents(true);
      const regularizeOptionsPromise = Promise.allSettled([
        regularizeService.listProcesses({ status: "Todos" }),
        regularizeService.listLicenses({ status: "Todos" }),
      ]);

      try {
        const detail = await taskModelService.detail(initialData.id);

        if (cancelled) {
          return;
        }

        const responsibleSequence = normalizeTaskModelResponsibleSequence({
          responsible_id: detail.responsible_id ?? "",
          responsible2_id: detail.responsible2_id ?? "",
          responsible3_id: detail.responsible3_id ?? "",
        });

        setFormData({
          name: detail.name ?? "",
          department_id: detail.department_id ?? "",
          ...responsibleSequence,
          observations: detail.observations ?? "",
          billing: detail.billing || EMPTY_FORM_DATA.billing,
          prevision: Number.isFinite(detail.prevision) ? detail.prevision : 0,
          type: "Projeto",
        });

        const [dependentsResult, linksResult, regularizeOptionsResult] = await Promise.allSettled([
          taskModelService.listDependents(initialData.id),
          taskModelService.listRegularizeLinks(initialData.id),
          regularizeOptionsPromise,
        ]);
        if (!cancelled) {
          if (dependentsResult.status === "fulfilled") {
            setDependents(dependentsResult.value);
          } else {
            setDependents([]);
            toast.warning("Não foi possível carregar dependências do modelo.");
          }
          if (linksResult.status === "fulfilled") {
            setRegularizeLinks(linksResult.value);
          } else {
            toast.warning("Não foi possível carregar vínculos do Regularize.");
          }
          if (regularizeOptionsResult.status === "rejected") {
            toast.warning("Não foi possível carregar destinos do Regularize.");
            return;
          }
          const [processesResult, licensesResult] = regularizeOptionsResult.value;
          if (processesResult.status === "rejected" || licensesResult.status === "rejected") {
            toast.warning("Não foi possível carregar destinos do Regularize.");
            return;
          }
          setRegularizeOptions([
            ...processesResult.value.map((item) => ({
              id: item.id,
              label: `Processo: ${item.process_type}`,
              type: "process" as const,
            })),
            ...licensesResult.value.map((item) => ({
              id: item.id,
              label: `Licença: ${item.type_license}`,
              type: "license" as const,
            })),
          ]);
        }
      } catch (error) {
        if (!cancelled) {
          setDetailError(true);
          toast.error(getApiErrorMessage(error, "Não foi possível carregar o modelo."));
        }
      } finally {
        if (!cancelled) {
          setLoadingDetail(false);
          setLoadingDependents(false);
        }
      }
    }

    void loadModelDetail();

    return () => {
      cancelled = true;
    };
  }, [isOpen, initialData?.id]);

  function updateFormValue<Key extends keyof CreateTaskModelData>(
    field: Key,
    value: CreateTaskModelData[Key],
  ) {
    setFormData((currentData) => {
      const updatedData: CreateTaskModelData = {
        ...currentData,
        [field]: value,
      };

      if (
        field === "responsible_id" ||
        field === "responsible2_id" ||
        field === "responsible3_id"
      ) {
        return {
          ...updatedData,
          ...normalizeTaskModelResponsibleSequence(updatedData),
        };
      }

      return updatedData;
    });
  }

  function shouldRenderCurrentDepartmentOption() {
    return (
      Boolean(formData.department_id) &&
      !departments.some((department) => department.id === formData.department_id)
    );
  }

  function shouldRenderCurrentUserOption(userId: string) {
    return Boolean(userId) && !users.some((user) => user.id === userId);
  }

  function getDepartmentPlaceholder() {
    if (loadingOptions && departments.length === 0) {
      return "Carregando departamentos...";
    }

    if (departments.length === 0) {
      return "Nenhum departamento disponível";
    }

    return "Selecione";
  }

  function getUserPlaceholder(optional: boolean) {
    if (usersQuery.isLoading) {
      return "Carregando usuários...";
    }

    if (usersQuery.isError) {
      return "Usuários indisponíveis";
    }

    if (users.length === 0) {
      return "Nenhum usuário disponível";
    }

    return optional ? "Opcional" : "Selecione";
  }

  function getDependentPlaceholder() {
    if (loadingOptions && allTasks.length === 0) {
      return "Carregando modelos...";
    }

    if (availableDependentTasks.length === 0) {
      return "Nenhum modelo disponível";
    }

    return "Selecione o modelo";
  }

  async function refreshDependents() {
    if (!initialData?.id) {
      return;
    }

    setLoadingDependents(true);

    try {
      const dependentsData = await taskModelService.listDependents(initialData.id);
      setDependents(dependentsData);
    } catch {
      toast.error("Não foi possível atualizar dependências.");
    } finally {
      setLoadingDependents(false);
    }
  }

  async function handleSave() {
    if (!formData.name.trim() || !formData.department_id || !formData.responsible_id) {
      toast.warning("Preencha nome, departamento e responsável.");
      return;
    }

    setSaving(true);

    try {
      const success = await onSave({
        ...formData,
        name: formData.name.trim(),
        observations: formData.observations.trim(),
        id: initialData?.id,
      });

      if (success) {
        onClose();
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleAddDependent() {
    if (!initialData?.id) {
      toast.warning("Salve o modelo antes de adicionar dependências.");
      return;
    }

    if (!newDependent.dependent_id) {
      toast.warning("Selecione um modelo dependente.");
      return;
    }

    setLoadingDependents(true);

    try {
      await taskModelService.addDependent({
        task_model_id: initialData.id,
        dependent_id: newDependent.dependent_id,
        wait: newDependent.wait,
        observation: newDependent.observation.trim(),
      });
      setNewDependent({ dependent_id: "", wait: false, observation: "" });
      toast.success("Dependência adicionada.");
      await refreshDependents();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Não foi possível adicionar dependência."));
    } finally {
      setLoadingDependents(false);
    }
  }

  async function handleConfirmDependentDeletion() {
    const relationId = pendingDependentDeletion;

    if (!relationId) {
      return;
    }

    setLoadingDependents(true);

    try {
      await taskModelService.deleteDependent(relationId);
      toast.success("Dependência removida.");
      await refreshDependents();
      setPendingDependentDeletion(null);
      setDependentDeletionError(null);
    } catch (error) {
      const message = "Não foi possível remover dependência.";
      toast.error(message);
      setDependentDeletionError(message);
      throw error;
    } finally {
      setLoadingDependents(false);
    }
  }

  async function handleAddRegularizeLink() {
    if (!initialData?.id || !regularizeDestination) return;
    try {
      await taskModelService.addRegularizeLink(initialData.id, regularizeDestination, regularizeType);
      setRegularizeLinks(await taskModelService.listRegularizeLinks(initialData.id));
      setRegularizeDestination("");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Não foi possível adicionar vínculo do Regularize."));
    }
  }

  async function handleDeleteRegularizeLink(id: string) {
    try {
      await taskModelService.deleteRegularizeLink(id);
      setRegularizeLinks((current) => current.filter((link) => link.id !== id));
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Não foi possível remover vínculo do Regularize."));
    }
  }

  const optionsUnavailable =
    loadingOptions || requiredOptionsWarning || usersQuery.isLoading || usersQuery.isError;
  const taskModelsUnavailable = loadingOptions || taskModelsWarning;
  const saveDisabled = saving || loadingDetail || detailError || optionsUnavailable;

  return (
    <>
      <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      title={isEditing ? "Editar modelo" : "Novo modelo"}
      description="Formulário de modelo de tarefa"
      contentClassName={TASK_FORM_CONTENT_CLASSNAME}
      bodyClassName={TASK_FORM_BODY_CLASSNAME}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className={PROJECT_SECONDARY_BUTTON_CLASSNAME}
            disabled={saving}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            className={PROJECT_PRIMARY_BUTTON_CLASSNAME}
            disabled={saveDisabled}
          >
            {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar
          </button>
        </>
      }
    >
      {loadingDetail ? (
        <div className="flex min-h-52 items-center justify-center text-sm text-slate-500 dark:text-slate-400">
          <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
          Carregando modelo...
        </div>
      ) : detailError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300">
          Não foi possível carregar o modelo para edição.
        </div>
      ) : (
        <form
          className={TASK_FORM_FORM_CLASSNAME}
          onSubmit={(event) => {
            event.preventDefault();
            void handleSave();
          }}
        >
          {optionsWarning ? (
            <div
              className={`${TASK_FORM_AUXILIARY_WARNING_CLASSNAME} flex items-center justify-between gap-3`}
            >
              <span>{optionsWarning}</span>
              <button
                type="button"
                onClick={() => setOptionsRetryKey((currentKey) => currentKey + 1)}
                className="shrink-0 rounded-lg border border-current px-2.5 py-1 text-xs font-semibold"
                disabled={loadingOptions}
              >
                Tentar novamente
              </button>
            </div>
          ) : null}

          <div className={TASK_FORM_GRID_CLASSNAME}>
            <label className={TASK_FORM_LABEL_CLASSNAME}>
              <RequiredFieldLabel className="text-sm font-medium text-slate-700 dark:text-white" required>
                Nome
              </RequiredFieldLabel>
              <input
                type="text"
                value={formData.name}
                onChange={(event) => updateFormValue("name", event.target.value)}
                className={PROJECT_INPUT_CLASSNAME}
                placeholder="Nome do modelo"
                aria-required="true"
              />
            </label>

            <label className={TASK_FORM_LABEL_CLASSNAME}>
              <RequiredFieldLabel className="text-sm font-medium text-slate-700 dark:text-white" required>
                Departamento
              </RequiredFieldLabel>
              <ProjectSelect
                value={formData.department_id}
                onChange={(event) => updateFormValue("department_id", event.target.value)}
                disabled={optionsUnavailable}
                aria-required="true"
              >
                <option value="">{getDepartmentPlaceholder()}</option>
                {shouldRenderCurrentDepartmentOption() ? (
                  <option value={formData.department_id}>Departamento atual</option>
                ) : null}
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </ProjectSelect>
            </label>
          </div>

          <div className={TASK_FORM_THREE_COLUMN_GRID_CLASSNAME}>
            <label className={TASK_FORM_LABEL_CLASSNAME}>
              <RequiredFieldLabel className="text-sm font-medium text-slate-700 dark:text-white" required>
                Responsável
              </RequiredFieldLabel>
              <ProjectSelect
                value={formData.responsible_id}
                onChange={(event) => updateFormValue("responsible_id", event.target.value)}
                disabled={optionsUnavailable}
                aria-required="true"
              >
                <option value="">{getUserPlaceholder(false)}</option>
                {shouldRenderCurrentUserOption(formData.responsible_id) ? (
                  <option value={formData.responsible_id}>Responsável atual</option>
                ) : null}
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </ProjectSelect>
            </label>

            <label className={TASK_FORM_LABEL_CLASSNAME}>
              <span className="text-sm font-medium text-slate-700 dark:text-white">
                Responsável 2
              </span>
              <ProjectSelect
                value={formData.responsible2_id}
                onChange={(event) => updateFormValue("responsible2_id", event.target.value)}
                disabled={!formData.responsible_id || optionsUnavailable}
                aria-describedby={
                  !formData.responsible_id ? "task-model-responsible2-help" : undefined
                }
              >
                <option value="">{getUserPlaceholder(true)}</option>
                {shouldRenderCurrentUserOption(formData.responsible2_id) ? (
                  <option value={formData.responsible2_id}>Responsável 2 atual</option>
                ) : null}
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </ProjectSelect>
              {!formData.responsible_id ? (
                <span
                  id="task-model-responsible2-help"
                  className="text-xs text-slate-500 dark:text-slate-400"
                >
                  Selecione o responsável antes de definir o responsável 2.
                </span>
              ) : null}
            </label>

            <label className={TASK_FORM_LABEL_CLASSNAME}>
              <span className="text-sm font-medium text-slate-700 dark:text-white">
                Responsável 3
              </span>
              <ProjectSelect
                value={formData.responsible3_id}
                onChange={(event) => updateFormValue("responsible3_id", event.target.value)}
                disabled={!formData.responsible2_id || optionsUnavailable}
                aria-describedby={
                  !formData.responsible2_id ? "task-model-responsible3-help" : undefined
                }
              >
                <option value="">{getUserPlaceholder(true)}</option>
                {shouldRenderCurrentUserOption(formData.responsible3_id) ? (
                  <option value={formData.responsible3_id}>Responsável 3 atual</option>
                ) : null}
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </ProjectSelect>
              {!formData.responsible2_id ? (
                <span
                  id="task-model-responsible3-help"
                  className="text-xs text-slate-500 dark:text-slate-400"
                >
                  Selecione o responsável 2 antes de definir o responsável 3.
                </span>
              ) : null}
            </label>
          </div>

          <div className={TASK_FORM_GRID_CLASSNAME}>
            <label className={TASK_FORM_LABEL_CLASSNAME}>
              <span className="text-sm font-medium text-slate-700 dark:text-white">
                Previsão em dias
              </span>
              <input
                type="number"
                min={0}
                value={formData.prevision}
                onChange={(event) =>
                  updateFormValue("prevision", Number.parseInt(event.target.value, 10) || 0)
                }
                className={PROJECT_INPUT_CLASSNAME}
              />
            </label>

            <label className={TASK_FORM_LABEL_CLASSNAME}>
              <span className="text-sm font-medium text-slate-700 dark:text-white">Cobrança</span>
              <ProjectSelect
                value={formData.billing}
                onChange={(event) => updateFormValue("billing", event.target.value)}
              >
                {BILLING_OPTIONS.map((billing) => (
                  <option key={billing} value={billing}>
                    {billing}
                  </option>
                ))}
              </ProjectSelect>
            </label>
          </div>

          <label className={TASK_FORM_LABEL_CLASSNAME}>
            <span className="text-sm font-medium text-slate-700 dark:text-white">Observações</span>
            <div className="relative">
              <FileText className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
              <textarea
                value={formData.observations}
                onChange={(event) => updateFormValue("observations", event.target.value)}
                className={`${PROJECT_INPUT_CLASSNAME} ${TASK_FORM_TEXTAREA_CLASSNAME}`}
                placeholder="Notas do modelo"
              />
            </div>
          </label>

          {isEditing ? (
            <section className={`${PROJECT_SUBPANEL_CLASSNAME} p-3`}>
              <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">
                Regularize
              </h3>
              <div className="grid gap-3 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-end">
                <ProjectSelect
                  aria-label="Tipo de destino Regularize"
                  value={regularizeType}
                  onChange={(event) => {
                    setRegularizeType(event.target.value as "process" | "license");
                    setRegularizeDestination("");
                  }}
                >
                  <option value="process">Processo</option>
                  <option value="license">Licença</option>
                </ProjectSelect>
                <ProjectSelect
                  aria-label="Destino Regularize"
                  value={regularizeDestination}
                  onChange={(event) => setRegularizeDestination(event.target.value)}
                >
                  <option value="">Selecione o destino</option>
                  {regularizeOptions
                    .filter((option) => option.type === regularizeType)
                    .map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                </ProjectSelect>
                <button
                  type="button"
                  onClick={() => void handleAddRegularizeLink()}
                  className={PROJECT_COMPACT_PRIMARY_BUTTON_CLASSNAME}
                  disabled={!regularizeDestination}
                  aria-label="Adicionar vínculo Regularize"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Adicionar
                </button>
              </div>
              <ul className="mt-3 space-y-2 text-sm">
                {regularizeLinks.length === 0 ? (
                  <li className="text-slate-500">Nenhum vínculo cadastrado.</li>
                ) : (
                  regularizeLinks.map((link) => (
                    <li key={link.id} className="flex items-center justify-between gap-3">
                      <span>
                        {link.referring_type === "process" ? "Processo" : "Licença"}:{" "}
                        {regularizeOptions.find((option) => option.id === link.referring)?.label.replace(/^(Processo|Licença): /, "") ??
                          link.referring}
                        {link.available ? "" : " (indisponível)"}
                      </span>
                      <button
                        type="button"
                        onClick={() => void handleDeleteRegularizeLink(link.id)}
                        className={PROJECT_COMPACT_DANGER_BUTTON_CLASSNAME}
                        aria-label="Remover vínculo Regularize"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </section>
          ) : null}
          {isEditing ? (
            <section className={`${PROJECT_SUBPANEL_CLASSNAME} p-3`}>
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Dependências
                </h3>
                {loadingDependents ? (
                  <span className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                    <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                    Atualizando
                  </span>
                ) : null}
              </div>

              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
                <label className={TASK_FORM_LABEL_CLASSNAME}>
                  <span className="text-sm font-medium text-slate-700 dark:text-white">
                    Modelo dependente
                  </span>
                  <ProjectSelect
                    value={newDependent.dependent_id}
                    onChange={(event) =>
                      setNewDependent((currentValue) => ({
                        ...currentValue,
                        dependent_id: event.target.value,
                      }))
                    }
                    disabled={taskModelsUnavailable}
                  >
                    <option value="">{getDependentPlaceholder()}</option>
                    {availableDependentTasks.map((task) => (
                      <option key={task.id} value={task.id}>
                        {task.name}
                      </option>
                    ))}
                  </ProjectSelect>
                </label>

                <label className={TASK_FORM_LABEL_CLASSNAME}>
                  <span className="text-sm font-medium text-slate-700 dark:text-white">
                    Observação
                  </span>
                  <input
                    type="text"
                    value={newDependent.observation}
                    onChange={(event) =>
                      setNewDependent((currentValue) => ({
                        ...currentValue,
                        observation: event.target.value,
                      }))
                    }
                    className={PROJECT_INPUT_CLASSNAME}
                    placeholder="Opcional"
                  />
                </label>

                <button
                  type="button"
                  onClick={() => void handleAddDependent()}
                  className={PROJECT_COMPACT_PRIMARY_BUTTON_CLASSNAME}
                  disabled={loadingDependents}
                >
                  {loadingDependents ? (
                    <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Plus className="h-3.5 w-3.5" />
                  )}
                  Adicionar
                </button>
              </div>

              <label className="mt-3 inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={newDependent.wait}
                  onChange={(event) =>
                    setNewDependent((currentValue) => ({
                      ...currentValue,
                      wait: event.target.checked,
                    }))
                  }
                  className="h-4 w-4 rounded border-slate-300"
                />
                Aguardar dependência
              </label>

              <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
                <table className="min-w-full table-fixed">
                  <thead className="border-b border-slate-200 bg-slate-50/80 dark:border-slate-700 dark:bg-slate-950/40">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-blue-200/80">
                        Modelo
                      </th>
                      <th className="w-24 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-blue-200/80">
                        Espera
                      </th>
                      <th className="w-28 px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-blue-200/80">
                        Ações
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {dependents.length === 0 ? (
                      <tr>
                        <td
                          colSpan={3}
                          className="px-3 py-4 text-sm text-slate-500 dark:text-slate-400"
                        >
                          Nenhuma dependência cadastrada.
                        </td>
                      </tr>
                    ) : (
                      dependents.map((dependent) => (
                        <tr
                          key={dependent.id}
                          className="border-b border-slate-200/80 last:border-b-0 dark:border-slate-800"
                        >
                          <td className="px-3 py-2 text-sm text-slate-700 dark:text-slate-200">
                            <p className="font-medium text-slate-900 dark:text-white">
                              {dependent.dependent?.name || "Modelo removido"}
                            </p>
                            {dependent.observation ? (
                              <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
                                {dependent.observation}
                              </p>
                            ) : null}
                          </td>
                          <td className="px-3 py-2 text-sm text-slate-600 dark:text-slate-300">
                            {dependent.wait ? "Sim" : "Não"}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex justify-center">
                              <button
                                type="button"
                                onClick={() => {
                                  setDependentDeletionError(null);
                                  setPendingDependentDeletion(dependent.id);
                                }}
                                className={PROJECT_COMPACT_DANGER_BUTTON_CLASSNAME}
                                disabled={loadingDependents}
                                aria-label={`Remover dependência ${dependent.dependent?.name ?? ""}`}
                                title="Remover dependência"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
        </form>
      )}
      </Dialog>

      <ConfirmationDialog
        open={Boolean(pendingDependentDeletion)}
        onOpenChange={(open) => {
          if (!open && !loadingDependents) {
            setPendingDependentDeletion(null);
            setDependentDeletionError(null);
          }
        }}
        title="Remover dependência?"
        description="Esta ação remove a dependência selecionada do modelo de tarefa."
        onConfirm={handleConfirmDependentDeletion}
        isConfirming={loadingDependents}
        errorMessage={dependentDeletionError}
        confirmLabel="Remover dependência"
        cancelLabel="Cancelar"
        variant="destructive"
      />
    </>
  );
}
