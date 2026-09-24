import { useState } from "react";
import { Link2, Plus, Trash2, UserPen } from "lucide-react";

import { isAxiosError } from "axios";

import { ConfirmationDialog } from "@shared/components";
import { formatCPF_CNPJ } from "@shared/utils/formatters";

import { RegularizeClientPfForm } from "@modules/regularize/components/RegularizeClientPfForm";
import { RegularizePartnerForm } from "@modules/regularize/components/RegularizePartnerForm";
import {
  useCreateRegularizeClientPfMutation,
  useCreateRegularizePartnerMutation,
  useDeleteRegularizePartnerMutation,
  useRegularizeClientPfDetail,
  useRegularizePartners,
  useUpdateRegularizeClientPfMutation,
  useUpdateRegularizePartnerMutation,
} from "@modules/regularize/hooks/useRegularizePeople";
import type {
  CreateRegularizeClientPfPayload,
  CreateRegularizePartnerPayload,
  RegularizePartner,
  UpdateRegularizeClientPfPayload,
  UpdateRegularizePartnerPayload,
} from "@modules/regularize/types";
import { DocumentIssueBadge } from "@shared/components/DocumentIssueBadge";

type ClientLike = { id: string };
type FormMode = "create-pf" | "edit-pf" | "create-partner" | "edit-partner" | null;

function formatDate(value: string | null | undefined): string {
  return value ? new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(value)) : "—";
}

export function ClientPartnersSection({ client }: { client: ClientLike; perms: unknown }) {
  const [formMode, setFormMode] = useState<FormMode>(null);
  const [partner, setPartner] = useState<RegularizePartner | null>(null);
  const [pfId, setPfId] = useState<string | null>(null);
  const partners = useRegularizePartners({ type: "pj", client_id: client.id });
  const clientPf = useRegularizeClientPfDetail(pfId, { enabled: formMode === "edit-pf" });
  const createPf = useCreateRegularizeClientPfMutation();
  const updatePf = useUpdateRegularizeClientPfMutation();
  const createPartner = useCreateRegularizePartnerMutation();
  const updatePartner = useUpdateRegularizePartnerMutation();
  const deletePartner = useDeleteRegularizePartnerMutation();
  const [removing, setRemoving] = useState<RegularizePartner | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  async function confirmRemove() {
    if (!removing) return;
    setRemoveError(null);
    try {
      await deletePartner.mutateAsync(removing.id);
    } catch (error) {
      const message = isAxiosError(error) ? error.response?.data?.error : undefined;
      setRemoveError(typeof message === "string" ? message : "Não foi possível remover o vínculo.");
      throw error;
    }
  }

  function closeForm() {
    setFormMode(null);
    setPartner(null);
  }

  async function savePf(payload: CreateRegularizeClientPfPayload | UpdateRegularizeClientPfPayload) {
    const saved = "id" in payload ? await updatePf.mutateAsync(payload) : await createPf.mutateAsync(payload);
    if (!("id" in payload)) {
      setPfId(saved.id);
      setFormMode("create-partner");
      return;
    }
    closeForm();
  }

  async function savePartner(payload: CreateRegularizePartnerPayload | UpdateRegularizePartnerPayload) {
    if ("id" in payload) await updatePartner.mutateAsync(payload);
    else await createPartner.mutateAsync(payload);
    closeForm();
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Sócios</h2>
          <p className="text-sm text-gray-600 dark:text-gray-300">Pessoas físicas vinculadas a esta empresa.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" className="ui-button-primary" onClick={() => setFormMode("create-partner")}><Plus size={16} />Vincular PF</button>
          <button type="button" className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-100 dark:hover:bg-gray-800" onClick={() => setFormMode("create-pf")}><Plus size={16} className="mr-1 inline" />Nova PF</button>
        </div>
      </div>
      {partners.isLoading ? <p role="status" className="text-sm text-gray-600 dark:text-gray-300">Carregando sócios...</p> : null}
      {partners.isError ? <p role="alert" className="text-sm text-red-700 dark:text-red-300">Não foi possível carregar os sócios.</p> : null}
      {!partners.isLoading && !partners.isError && (partners.data?.length ?? 0) === 0 ? <p className="rounded-lg border border-dashed border-gray-300 px-4 py-6 text-sm text-gray-600 dark:border-gray-600 dark:text-gray-300">Nenhum sócio vinculado.</p> : null}
      {(partners.data?.length ?? 0) > 0 ? <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700"><table className="w-full text-left text-sm"><thead className="bg-gray-50 text-gray-700 dark:bg-slate-900 dark:text-gray-200"><tr><th className="px-4 py-3">Nome</th><th className="px-4 py-3">CPF</th><th className="px-4 py-3">Nascimento</th><th className="px-4 py-3">Participação</th><th className="px-4 py-3">Vínculo</th><th className="px-4 py-3"><span className="sr-only">Ações</span></th></tr></thead><tbody>{partners.data?.map((item) => <tr key={item.id} className="border-t border-gray-200 text-gray-800 dark:border-gray-700 dark:text-gray-100"><td className="px-4 py-3 font-medium">{item.clientPF?.name ?? "—"}</td><td className="px-4 py-3">{item.clientPF?.cpf ? formatCPF_CNPJ(item.clientPF.cpf) : "—"}<DocumentIssueBadge value={item.clientPF?.cpf} /></td><td className="px-4 py-3">{formatDate(item.clientPF?.date_of_birth)}</td><td className="px-4 py-3">{item.part ?? "—"}%</td><td className="px-4 py-3">{formatDate(item.entry)} a {formatDate(item.exit)}</td><td className="px-4 py-3"><div className="flex justify-end gap-1"><button type="button" aria-label="Editar pessoa física" title="Editar pessoa física" onClick={() => { setPfId(item.pf_id); setFormMode("edit-pf"); }} className="rounded p-2 hover:bg-gray-100 dark:hover:bg-gray-800"><UserPen size={16} /></button><button type="button" aria-label="Editar vínculo" title="Editar vínculo" onClick={() => { setPartner(item); setFormMode("edit-partner"); }} className="rounded p-2 hover:bg-gray-100 dark:hover:bg-gray-800"><Link2 size={16} /></button><button type="button" aria-label="Remover vínculo" title="Remover vínculo" disabled={deletePartner.isPending} onClick={() => setRemoving(item)} className="rounded p-2 text-red-700 hover:bg-red-50 disabled:opacity-50 dark:text-red-300 dark:hover:bg-red-950"><Trash2 size={16} /></button></div></td></tr>)}</tbody></table></div> : null}
      <ConfirmationDialog
        open={Boolean(removing)}
        onOpenChange={(open) => {
          if (!open) {
            setRemoving(null);
            setRemoveError(null);
          }
        }}
        title="Remover vínculo"
        description={`Remover o vínculo de ${removing?.clientPF?.name ?? "este sócio"} com a empresa?`}
        onConfirm={confirmRemove}
        isConfirming={deletePartner.isPending}
        errorMessage={removeError}
        confirmLabel="Remover"
        cancelLabel="Cancelar"
      />
      <RegularizeClientPfForm open={formMode === "create-pf" || formMode === "edit-pf"} mode={formMode === "edit-pf" ? "edit" : "create"} clientPf={formMode === "edit-pf" ? clientPf.data ?? null : null} isLoadingInitialValue={formMode === "edit-pf" && clientPf.isLoading} isSubmitting={createPf.isPending || updatePf.isPending} onClose={closeForm} onSubmit={savePf} />
      <RegularizePartnerForm open={formMode === "create-partner" || formMode === "edit-partner"} partner={formMode === "edit-partner" ? partner : null} defaultPfId={formMode === "create-partner" ? pfId ?? "" : ""} defaultPjId={client.id} excludePfIds={partners.data?.map((item) => item.pf_id)} isSubmitting={createPartner.isPending || updatePartner.isPending} onClose={closeForm} onSubmit={savePartner} />
    </section>
  );
}
