import { Copy, FolderOpen, Loader2, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "@shared/services/toast";

import { ConfirmationDialog, Dialog } from "@shared/components";
import { useAuth } from "@/context/AuthContext";
import { isOrganizationOwner } from "@modules/auth";

import {
  useCopySharedReportModelMutation,
  useDeleteReportModelMutation,
  useReportModels,
  useSharedReportModels,
  useUpdateSharedReportModelMutation,
} from "../hooks/useReports";
import { reportsService } from "../services/reportsService";
import type { ReportModel, SharedReportModel } from "../types/report.types";
import { panelClassName } from "./reportUi";

function modelSummary(model: ReportModel | SharedReportModel) {
  if ("version" in model.definition) {
    return {
      areas: model.definition.areas.length,
      fields: model.definition.areas.reduce((total, area) => total + ("fields" in area ? area.fields.length : area.display.columns.length), 0),
      criteria: model.definition.areas.reduce(
        (total, area) => total + (area.filters?.length ?? 0),
        0,
      ),
    };
  }
  return {
    areas: model.definition.sources.length,
    fields: model.definition.columns.length,
    criteria: model.definition.filters.length,
  };
}

function ModelCard({ model, shared, canManageShared, onEdit, onOpen, opening }: { model: ReportModel | SharedReportModel; shared?: boolean; canManageShared?: boolean; onEdit?: () => void; onOpen: (model: ReportModel | SharedReportModel) => void; opening?: boolean }) {
  const deleteMutation = useDeleteReportModelMutation();
  const copyMutation = useCopySharedReportModelMutation();
  const summary = modelSummary(model);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  async function copyModel() {
    try {
      await copyMutation.mutateAsync(model.id);
      toast.success("Modelo copiado para seus modelos pessoais.");
    } catch {
      toast.error("Não foi possível copiar o modelo.");
    }
  }

  async function deleteModel() {
    await deleteMutation.mutateAsync(model.id);
    toast.success("Modelo excluído.");
  }

  return (
    <li className="rounded-lg border border-gray-200 p-4 dark:border-slate-700">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-medium text-gray-900 dark:text-white">{model.name}</h3>
          <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
            {shared ? `Proprietário: ${model.owner_name ?? "organização"}` : "Modelo pessoal"} · versão {model.version}
          </p>
        </div>
        <span className="rounded-full bg-gray-100 px-2 py-1 text-[11px] text-gray-600 dark:bg-slate-800 dark:text-slate-300">{shared ? "Compartilhado" : "Pessoal"}</span>
      </div>
      {model.description ? <p className="mt-3 text-sm text-gray-600 dark:text-slate-300">{model.description}</p> : null}
      <p className="mt-3 text-xs text-gray-600 dark:text-slate-400">{summary.areas} {summary.areas === 1 ? "área" : "áreas"} · {summary.fields} {summary.fields === 1 ? "campo" : "campos"} · {summary.criteria} {summary.criteria === 1 ? "critério" : "critérios"}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" disabled={opening} onClick={() => onOpen(model)} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          {opening ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FolderOpen className="h-3.5 w-3.5" />} {opening ? "Abrindo..." : "Abrir modelo"}
        </button>
        {shared ? (
          <button type="button" onClick={() => void copyModel()} disabled={copyMutation.isPending} className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 px-3 py-2 text-xs font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50 dark:border-blue-800 dark:text-blue-300 dark:hover:bg-blue-950/30">
            {copyMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />} Copiar como modelo pessoal
          </button>
        ) : (
          <button type="button" onClick={() => setConfirmingDelete(true)} disabled={deleteMutation.isPending} className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/30">
            <Trash2 className="h-3.5 w-3.5" /> Excluir
          </button>
        )}
        {shared && canManageShared ? (
          <button type="button" onClick={onEdit} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">
            <Pencil className="h-3.5 w-3.5" /> Versionar
          </button>
        ) : null}
      </div>
      <ConfirmationDialog
        open={confirmingDelete}
        onOpenChange={setConfirmingDelete}
        title="Excluir modelo pessoal"
        description={`Excluir o modelo pessoal "${model.name}"?`}
        onConfirm={deleteModel}
        isConfirming={deleteMutation.isPending}
        errorMessage={null}
        confirmLabel="Excluir"
        cancelLabel="Cancelar"
      />
    </li>
  );
}

export function ReportModelsPanel({ canManageShared, onOpenModel }: { canManageShared: boolean; onOpenModel: (model: ReportModel | SharedReportModel) => void }) {
  const { user } = useAuth();
  const personalQuery = useReportModels();
  const sharedQuery = useSharedReportModels();
  const [editing, setEditing] = useState<SharedReportModel | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const updateMutation = useUpdateSharedReportModelMutation();
  const isAdmin = canManageShared || isOrganizationOwner(user);

  async function openModel(model: ReportModel | SharedReportModel) {
    setOpeningId(model.id);
    try {
      const opened = "department_id" in model
        ? await reportsService.getSharedModel(model.id)
        : await reportsService.getModel(model.id);
      onOpenModel(opened);
    } catch {
      toast.error("Não foi possível abrir o modelo. Seu acesso pode ter mudado.");
    } finally {
      setOpeningId(null);
    }
  }

  async function saveVersion(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? editing.name).trim();
    try {
      await updateMutation.mutateAsync({ id: editing.id, name, definition: editing.definition });
      toast.success("Nova versão publicada.");
      setEditing(null);
    } catch {
      toast.error("Não foi possível publicar a versão.");
    }
  }

  return (
    <section className={panelClassName} aria-labelledby="reports-models-title">
      <div className="mb-5">
        <h2 id="reports-models-title" className="text-lg font-semibold text-gray-900 dark:text-white">Modelos</h2>
        <p className="mt-1 text-sm text-gray-600 dark:text-slate-400">Modelos compartilhados são somente leitura para membros; copie um modelo para personalizá-lo.</p>
      </div>
      {personalQuery.isPending || sharedQuery.isPending ? <p className="text-sm text-gray-600 dark:text-slate-400" role="status">Carregando modelos...</p> : null}
      {personalQuery.isError || sharedQuery.isError ? <p role="alert" className="text-sm text-red-600 dark:text-red-400">Não foi possível carregar os modelos.</p> : null}
      {!personalQuery.isPending && !sharedQuery.isPending && !personalQuery.isError && !sharedQuery.isError ? (
        <div className="space-y-6">
          <div>
            <h3 className="mb-3 text-sm font-semibold text-gray-800 dark:text-gray-200">Meus modelos</h3>
            {personalQuery.data?.length ? <ul className="grid gap-3 lg:grid-cols-2">{personalQuery.data.map((model) => <ModelCard key={model.id} model={model} onOpen={() => void openModel(model)} opening={openingId === model.id} />)}</ul> : <p className="text-sm text-gray-500 dark:text-slate-500">Você ainda não possui modelos pessoais.</p>}
          </div>
          <div>
            <div className="mb-3 flex items-center justify-between gap-3"><h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Modelos compartilhados</h3>{isAdmin ? <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-slate-800 dark:text-slate-300">Administração habilitada</span> : null}</div>
            {sharedQuery.data?.length ? <ul className="grid gap-3 lg:grid-cols-2">{sharedQuery.data.map((model) => <ModelCard key={model.id} model={model} shared canManageShared={isAdmin} onEdit={() => setEditing(model)} onOpen={() => void openModel(model)} opening={openingId === model.id} />)}</ul> : <p className="text-sm text-gray-500 dark:text-slate-500">Nenhum modelo compartilhado disponível.</p>}
          </div>
        </div>
      ) : null}
      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)} title="Versionar modelo compartilhado" description="Publicar uma nova versão do modelo" footer={null}>
        {editing ? <form className="space-y-4" onSubmit={(event) => void saveVersion(event)}><label className="block text-sm font-medium text-gray-700 dark:text-gray-200">Nome da versão<input name="name" defaultValue={editing.name} className="mt-1 h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm dark:border-gray-600 dark:bg-slate-900" /></label><p className="text-xs text-gray-500 dark:text-slate-400">A configuração permanece íntegra e o membro não recebe controles de edição.</p><div className="flex justify-end gap-2"><button type="button" onClick={() => setEditing(null)} className="rounded-lg px-3 py-2 text-sm text-gray-600 dark:text-gray-300">Cancelar</button><button type="submit" disabled={updateMutation.isPending} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">Publicar versão</button></div></form> : null}
      </Dialog>
    </section>
  );
}
