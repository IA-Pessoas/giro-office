import Head from "next/head";
import Link from "next/link";
import { useState } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, ListChecks, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "@shared/services/toast";

import { canSSRAuth, useModuleAccess } from "@modules/auth";
import { useProjectPlans, useProjectPlanTasks, useTaskModels } from "@modules/integracao";
import { projectPlanService } from "@modules/integracao/services/projectPlanService";
import type { ProjectPlan } from "@modules/integracao/services/projectPlanService.contract";
import {
  PROJECT_COMPACT_BUTTON_CLASSNAME,
  PROJECT_COMPACT_DANGER_BUTTON_CLASSNAME,
  PROJECT_INPUT_CLASSNAME,
  PROJECT_PANEL_CLASSNAME,
  PROJECT_PRIMARY_BUTTON_CLASSNAME,
  PROJECT_SUBPANEL_CLASSNAME,
} from "@modules/integracao/components/projectUi";
import { ConfirmationDialog } from "@shared/components";

const EMPTY_PLAN = { name: "", color: "#2563eb" };


function getErrorMessage(error: unknown, fallback: string) {
  if (typeof error === "object" && error !== null && "response" in error) {
    const data = (error as { response?: { data?: { error?: string; message?: string } } }).response
      ?.data;
    return data?.error ?? data?.message ?? fallback;
  }
  return fallback;
}

export default function ProjectPlansConfig() {
  const { access: integracaoAccess } = useModuleAccess("integracao");
  const canManage = integracaoAccess.isAdmin;
  const plansQuery = useProjectPlans();
  const [selectedPlan, setSelectedPlan] = useState<ProjectPlan | null>(null);
  const [draft, setDraft] = useState(EMPTY_PLAN);
  const [modelId, setModelId] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [planToDelete, setPlanToDelete] = useState<ProjectPlan | null>(null);
  const tasksQuery = useProjectPlanTasks(selectedPlan?.id ?? null);
  const modelsQuery = useTaskModels({ page: 1, limit: 100 });

  function selectPlan(plan: ProjectPlan) {
    setSelectedPlan(plan);
    setDraft({ name: plan.name, color: plan.color });
    setModelId("");
  }

  function startNewPlan() {
    setSelectedPlan(null);
    setDraft(EMPTY_PLAN);
    setModelId("");
  }

  async function savePlan() {
    if (!canManage || !draft.name.trim()) {
      return;
    }

    setIsSaving(true);
    try {
      if (selectedPlan) {
        const updated = await projectPlanService.update({ ...selectedPlan, ...draft, name: draft.name.trim() });
        setSelectedPlan(updated);
        setDraft({ name: updated.name, color: updated.color });
        toast.success("Plano atualizado.");
      } else {
        const created = await projectPlanService.create({ ...draft, name: draft.name.trim() });
        selectPlan(created);
        toast.success("Plano criado.");
      }
      await plansQuery.refetch();
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível salvar o plano."));
    } finally {
      setIsSaving(false);
    }
  }

  async function addTask() {
    if (!selectedPlan || !modelId || !canManage) {
      return;
    }

    setIsSaving(true);
    try {
      await projectPlanService.addTask({ plan_id: selectedPlan.id, task_id: modelId });
      setModelId("");
      await tasksQuery.refetch();
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível adicionar o modelo ao plano."));
    } finally {
      setIsSaving(false);
    }
  }

  async function moveTask(planTaskId: string, direction: "up" | "down") {
    if (!selectedPlan || !canManage) {
      return;
    }

    setIsSaving(true);
    try {
      await projectPlanService.reorderTask({
        plan_id: selectedPlan.id,
        plan_task_id: planTaskId,
        direction,
      });
      await tasksQuery.refetch();
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível reordenar o plano."));
    } finally {
      setIsSaving(false);
    }
  }

  async function removeTask(planTaskId: string) {
    if (!selectedPlan || !canManage) {
      return;
    }

    setIsSaving(true);
    try {
      await projectPlanService.deleteTask({ plan_id: selectedPlan.id, plan_task_id: planTaskId });
      await tasksQuery.refetch();
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível remover o modelo do plano."));
    } finally {
      setIsSaving(false);
    }
  }

  async function deletePlan() {
    if (!planToDelete || !canManage) {
      return;
    }

    setIsSaving(true);
    try {
      await projectPlanService.delete(planToDelete.id);
      if (selectedPlan?.id === planToDelete.id) startNewPlan();
      setPlanToDelete(null);
      await plansQuery.refetch();
      toast.success("Plano removido.");
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível remover o plano."));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <Head><title>Planos de trabalho - Integração</title></Head>
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Link href="/configs/integracao" className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white">
              <ArrowLeft className="h-4 w-4" /> Configurações da Integração
            </Link>
            <h1 className="mt-3 text-3xl font-bold text-slate-900 dark:text-white">Planos de trabalho</h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Defina a sequência de modelos que será contratada no projeto.</p>
          </div>
          {canManage ? <button type="button" onClick={startNewPlan} className={PROJECT_PRIMARY_BUTTON_CLASSNAME}><Plus className="h-4 w-4" /> Novo plano</button> : null}
        </div>

        <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
          <section className={`${PROJECT_PANEL_CLASSNAME} p-4`}>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Planos cadastrados</h2>
            <div className="mt-3 space-y-2">
              {plansQuery.isLoading ? <p className="text-sm text-slate-500">Carregando planos...</p> : null}
              {!plansQuery.isLoading && plansQuery.data?.length === 0 ? <p className="text-sm text-slate-500">Nenhum plano cadastrado.</p> : null}
              {plansQuery.data?.map((plan) => (
                <button key={plan.id} type="button" onClick={() => selectPlan(plan)} className={`${PROJECT_SUBPANEL_CLASSNAME} flex w-full items-center gap-3 p-3 text-left ${selectedPlan?.id === plan.id ? "ring-2 ring-blue-500" : ""}`}>
                  <span className="min-w-0 flex-1 truncate font-medium text-slate-900 dark:text-white">{plan.name}</span>
                </button>
              ))}
            </div>
          </section>

          <section className={`${PROJECT_PANEL_CLASSNAME} p-6`}>
            <div className="flex items-center gap-3"><ListChecks className="h-5 w-5 text-slate-500" /><h2 className="text-lg font-semibold text-slate-900 dark:text-white">{selectedPlan ? "Editar plano" : "Novo plano"}</h2></div>
            {!canManage ? <p className="mt-4 text-sm text-amber-700 dark:text-amber-300">A manutenção de planos exige permissão administrativa.</p> : null}
            <div className="mt-5 grid gap-4 sm:grid-cols-[minmax(0,1fr)_100px_auto]">
              <label className="space-y-1"><span className="text-sm font-medium text-slate-700 dark:text-slate-200">Nome</span><input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} className={PROJECT_INPUT_CLASSNAME} disabled={!canManage || isSaving} /></label>
              <label className="space-y-1"><span className="text-sm font-medium text-slate-700 dark:text-slate-200">Cor</span><input type="color" value={draft.color} onChange={(event) => setDraft((current) => ({ ...current, color: event.target.value }))} className={`${PROJECT_INPUT_CLASSNAME} h-10 p-1`} disabled={!canManage || isSaving} /></label>
              <button type="button" onClick={() => void savePlan()} className={PROJECT_PRIMARY_BUTTON_CLASSNAME} disabled={!canManage || isSaving || !draft.name.trim()}><Save className="h-4 w-4" /> {selectedPlan ? "Salvar" : "Criar"}</button>
            </div>

            {selectedPlan ? <div className={`mt-6 ${PROJECT_SUBPANEL_CLASSNAME} p-4`}>
              <div className="flex flex-wrap items-end gap-3">
                <label className="min-w-0 flex-1 space-y-1"><span className="text-sm font-medium text-slate-700 dark:text-slate-200">Adicionar modelo</span><select value={modelId} onChange={(event) => setModelId(event.target.value)} className={PROJECT_INPUT_CLASSNAME} disabled={!canManage || isSaving || modelsQuery.isLoading}><option value="">Selecione um modelo</option>{modelsQuery.models.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}</select></label>
                <button type="button" onClick={() => void addTask()} className={PROJECT_COMPACT_BUTTON_CLASSNAME} disabled={!canManage || isSaving || !modelId}>Adicionar</button>
                <button type="button" onClick={() => setPlanToDelete(selectedPlan)} className={PROJECT_COMPACT_DANGER_BUTTON_CLASSNAME} disabled={!canManage || isSaving}><Trash2 className="h-3.5 w-3.5" /> Excluir plano</button>
              </div>
              <ol className="mt-4 space-y-2">
                {tasksQuery.isLoading ? <li className="text-sm text-slate-500">Carregando modelos...</li> : null}
                {!tasksQuery.isLoading && tasksQuery.data?.length === 0 ? <li className="text-sm text-slate-500">Plano vazio: ele pode ser salvo, mas não pode ser contratado.</li> : null}
                {tasksQuery.data?.map((task, index) => <li key={task.id} className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700"><span className="text-sm text-slate-500">{index + 1}</span><span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900 dark:text-white">{task.tasks.name}</span>{canManage ? <div className="flex gap-1"><button type="button" onClick={() => void moveTask(task.id, "up")} className={PROJECT_COMPACT_BUTTON_CLASSNAME} disabled={isSaving || index === 0} aria-label={`Mover ${task.tasks.name} para cima`}><ArrowUp className="h-3.5 w-3.5" /></button><button type="button" onClick={() => void moveTask(task.id, "down")} className={PROJECT_COMPACT_BUTTON_CLASSNAME} disabled={isSaving || index === (tasksQuery.data?.length ?? 0) - 1} aria-label={`Mover ${task.tasks.name} para baixo`}><ArrowDown className="h-3.5 w-3.5" /></button><button type="button" onClick={() => void removeTask(task.id)} className={PROJECT_COMPACT_DANGER_BUTTON_CLASSNAME} disabled={isSaving} aria-label={`Remover ${task.tasks.name}`}><Trash2 className="h-3.5 w-3.5" /></button></div> : null}</li>)}
              </ol>
            </div> : null}
          </section>
        </div>
      </div>
      <ConfirmationDialog open={Boolean(planToDelete)} onOpenChange={(open) => { if (!open && !isSaving) setPlanToDelete(null); }} title={`Excluir plano "${planToDelete?.name ?? ""}"?`} description="Projetos já contratados não são alterados." onConfirm={deletePlan} isConfirming={isSaving} errorMessage={null} confirmLabel="Excluir plano" cancelLabel="Cancelar" variant="destructive" />
    </>
  );
}

export const getServerSideProps = canSSRAuth(async () => ({ props: {} }));
