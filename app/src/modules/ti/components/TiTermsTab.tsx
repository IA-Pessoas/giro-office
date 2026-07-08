import { useMemo, useState, type FormEvent } from "react";
import { Eye, FileCheck2, Pencil, Plus, Signature } from "lucide-react";

import { useModuleAccess } from "@modules/auth";
import { Dialog } from "@shared/components/ui/Dialog";
import { cn } from "@shared/ui/newLayout/utils";

import {
  useCreateTiTermMutation,
  useSignTiTermMutation,
  useTiInventory,
  useTiTerm,
  useTiTerms,
  useUpdateTiTermMutation,
} from "../hooks";
import type { TiId, TiInventoryAsset, TiTerm } from "../types";
import { TiNativeSelect } from "./TiNativeSelect";
import {
  TiDataTable,
  TiDetailPanel,
  TiEmptyState,
  TiFieldLine,
  TiIconAction,
  TiInlineNotice,
  TiPanel,
  TiQueryStatePanel,
  TiSectionHeader,
  TiStatusPill,
  TiTableAction,
  TiTextarea,
  TiTextField,
} from "./tiFormControls";

type TermsDialogState =
  | { type: "term"; mode: "create"; term?: undefined }
  | { type: "term"; mode: "edit"; term: TiTerm }
  | { type: "sign"; term: TiTerm };

const TERM_STATUS_OPTIONS = [
  { value: "", label: "Todos" },
  { value: "draft", label: "Rascunho" },
  { value: "pending", label: "Pendente" },
  { value: "signed", label: "Assinado" },
  { value: "closed", label: "Encerrado" },
];

const TERM_FORM_STATUS_OPTIONS = TERM_STATUS_OPTIONS.filter((option) => option.value);

function getText(value: unknown, fallback = "-"): string {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  return String(value);
}

function getFormText(formData: FormData, field: string): string {
  return String(formData.get(field) ?? "").trim();
}

function compactPayload<TPayload extends Record<string, unknown>>(payload: TPayload): TPayload {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== "" && value !== null && value !== undefined),
  ) as TPayload;
}

function normalizeStatus(status: unknown): string {
  return String(status ?? "").trim().toLowerCase();
}

function formatStatus(status: unknown): string {
  const normalized = normalizeStatus(status);

  if (normalized === "draft") {
    return "Rascunho";
  }

  if (normalized === "pending") {
    return "Pendente";
  }

  if (normalized === "signed") {
    return "Assinado";
  }

  if (normalized === "closed") {
    return "Encerrado";
  }

  return getText(status, "Sem status");
}

function getStatusTone(status: unknown): "neutral" | "success" | "warning" | "danger" | "info" {
  const normalized = normalizeStatus(status);

  if (normalized === "signed") {
    return "success";
  }

  if (normalized === "pending") {
    return "warning";
  }

  if (normalized === "draft") {
    return "info";
  }

  return "neutral";
}

function formatDate(value: unknown): string {
  if (!value) {
    return "-";
  }

  const date = new Date(String(value));

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(date);
}

function getTermTitle(term: TiTerm): string {
  return getText(term.title ?? term.description, "Termo sem titulo");
}

function getAssetTitle(asset: TiInventoryAsset): string {
  return getText(asset.name ?? asset.code ?? asset.patrimony_code, "Ativo sem nome");
}

function getTermUser(term: TiTerm): string {
  return getText(term.user_name ?? term.assignee_name ?? term.user_id);
}

function getMutationErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Nao foi possivel concluir a acao.";
}

export function TiTermsTab() {
  const { access } = useModuleAccess("ti");
  const canManage = access.canEdit || access.isAdmin;
  const canSign = access.canView;
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [assetId, setAssetId] = useState("");
  const [selectedTermId, setSelectedTermId] = useState<TiId | undefined>();
  const [dialogState, setDialogState] = useState<TermsDialogState | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const filters = useMemo(
    () =>
      compactPayload({
        search,
        status,
        inventory_id: assetId,
        asset_id: assetId,
      }),
    [assetId, search, status],
  );

  const termsQuery = useTiTerms(filters);
  const assetsQuery = useTiInventory();
  const selectedTermQuery = useTiTerm(selectedTermId, { enabled: Boolean(selectedTermId) });
  const createTermMutation = useCreateTiTermMutation();
  const updateTermMutation = useUpdateTiTermMutation();
  const signTermMutation = useSignTiTermMutation();

  const assetsById = useMemo(
    () => new Map((assetsQuery.data ?? []).map((asset) => [String(asset.id), asset])),
    [assetsQuery.data],
  );

  const assetOptions = useMemo(
    () => [
      { value: "", label: "Todos" },
      ...(assetsQuery.data ?? []).map((asset) => ({
        value: String(asset.id),
        label: getAssetTitle(asset),
      })),
    ],
    [assetsQuery.data],
  );

  const selectedListTerm = (termsQuery.data ?? []).find(
    (term) => String(term.id) === String(selectedTermId),
  );
  const selectedTerm = selectedTermQuery.data ?? selectedListTerm;

  function getAssetName(id: unknown, term?: TiTerm): string {
    if (term?.inventory?.name) {
      return getText(term.inventory.name);
    }

    return getText(assetsById.get(String(id))?.name);
  }

  function closeDialog() {
    setDialogState(null);
    setDialogError(null);
  }

  function openDialog(nextDialogState: TermsDialogState) {
    setDialogError(null);
    setDialogState(nextDialogState);
  }

  async function handleSubmitTerm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canManage || dialogState?.type !== "term") {
      return;
    }

    const formData = new FormData(event.currentTarget);
    const selectedAssetId = getFormText(formData, "inventory_id");
    const payload = compactPayload({
      title: getFormText(formData, "title"),
      description: getFormText(formData, "description"),
      inventory_id: selectedAssetId,
      asset_id: selectedAssetId,
      user_id: getFormText(formData, "user_id"),
      user_name: getFormText(formData, "user_name"),
      status: getFormText(formData, "status"),
      content: getFormText(formData, "content"),
      notes: getFormText(formData, "notes"),
    });

    try {
      setDialogError(null);

      if (dialogState.mode === "edit") {
        await updateTermMutation.mutateAsync({ id: dialogState.term.id, payload });
      } else {
        const createdTerm = await createTermMutation.mutateAsync(payload);
        setSelectedTermId(createdTerm.id);
      }

      closeDialog();
    } catch (error) {
      setDialogError(getMutationErrorMessage(error));
    }
  }

  async function handleSubmitSign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canSign || dialogState?.type !== "sign") {
      return;
    }

    if (!confirm("Confirmar assinatura deste termo?")) {
      return;
    }

    const formData = new FormData(event.currentTarget);

    try {
      setDialogError(null);
      await signTermMutation.mutateAsync({
        id: dialogState.term.id,
        payload: compactPayload({
          signer_name: getFormText(formData, "signer_name"),
          notes: getFormText(formData, "notes"),
        }),
      });
      setSelectedTermId(dialogState.term.id);
      closeDialog();
    } catch (error) {
      setDialogError(getMutationErrorMessage(error));
    }
  }

  const isTermSubmitting = createTermMutation.isPending || updateTermMutation.isPending;

  return (
    <TiPanel className="space-y-5">
      <TiSectionHeader
        title="Termos"
        description="Acompanhe termos de responsabilidade, assinatura e vinculo com ativos."
        action={
          canManage ? (
            <TiIconAction
              icon={Plus}
              label="Novo termo"
              variant="primary"
              onClick={() => openDialog({ type: "term", mode: "create" })}
            />
          ) : null
        }
      />

      <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/60 md:grid-cols-[minmax(240px,1.4fr)_minmax(160px,1fr)_minmax(180px,1fr)]">
        <TiTextField
          label="Busca"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Titulo, usuario ou ativo"
        />
        <TiNativeSelect
          label="Status"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          options={TERM_STATUS_OPTIONS}
        />
        <TiNativeSelect
          label="Ativo"
          value={assetId}
          onChange={(event) => setAssetId(event.target.value)}
          options={assetOptions}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.75fr)]">
        <TiQueryStatePanel
          query={termsQuery}
          emptyState={
            <TiEmptyState
              icon={FileCheck2}
              title="Nenhum termo gerado"
              description="Os termos assinados ou pendentes ficam disponiveis nesta area."
              action={
                canManage ? (
                  <TiIconAction
                    icon={Plus}
                    label="Novo termo"
                    variant="primary"
                    onClick={() => openDialog({ type: "term", mode: "create" })}
                  />
                ) : null
              }
            />
          }
        >
          {(terms) => (
            <TiDataTable headers={["Termo", "Ativo", "Usuario", "Assinatura", "Status", ""]}>
              {terms.map((term) => {
                const isSelected = String(term.id) === String(selectedTermId);

                return (
                  <tr
                    key={term.id}
                    className={cn(
                      "text-slate-700 dark:text-slate-200",
                      isSelected ? "bg-blue-50/70 dark:bg-blue-950/20" : "",
                    )}
                  >
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        className="text-left font-semibold text-slate-900 hover:text-blue-700 dark:text-white dark:hover:text-blue-300"
                        onClick={() => setSelectedTermId(term.id)}
                      >
                        {getTermTitle(term)}
                      </button>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {formatDate(term.created_at)}
                      </p>
                    </td>
                    <td className="px-4 py-3">{getAssetName(term.inventory_id ?? term.asset_id, term)}</td>
                    <td className="px-4 py-3">{getTermUser(term)}</td>
                    <td className="px-4 py-3">{formatDate(term.signed_at)}</td>
                    <td className="px-4 py-3">
                      <TiStatusPill tone={getStatusTone(term.status)}>
                        {formatStatus(term.status)}
                      </TiStatusPill>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <TiTableAction
                          icon={Eye}
                          label="Detalhes"
                          onClick={() => setSelectedTermId(term.id)}
                        />
                        {canManage ? (
                          <TiTableAction
                            icon={Pencil}
                            label="Editar termo"
                            onClick={() => openDialog({ type: "term", mode: "edit", term })}
                          />
                        ) : null}
                        {canSign ? (
                          <TiTableAction
                            icon={Signature}
                            label="Assinar termo"
                            onClick={() => openDialog({ type: "sign", term })}
                          />
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </TiDataTable>
          )}
        </TiQueryStatePanel>

        <TiDetailPanel title="Detalhe do termo">
          {selectedTermQuery.isLoading ? (
            <TiFieldLine label="Status" value="Carregando..." />
          ) : selectedTermQuery.isError ? (
            <TiInlineNotice tone="danger">
              {selectedTermQuery.error?.message ?? "Nao foi possivel carregar o detalhe."}
            </TiInlineNotice>
          ) : selectedTerm ? (
            <>
              <TiFieldLine label="Termo" value={getTermTitle(selectedTerm)} />
              <TiFieldLine
                label="Ativo"
                value={getAssetName(selectedTerm.inventory_id ?? selectedTerm.asset_id, selectedTerm)}
              />
              <TiFieldLine label="Usuario" value={getTermUser(selectedTerm)} />
              <TiFieldLine label="Criado em" value={formatDate(selectedTerm.created_at)} />
              <TiFieldLine label="Assinado em" value={formatDate(selectedTerm.signed_at)} />
              <TiFieldLine
                label="Status"
                value={
                  <TiStatusPill tone={getStatusTone(selectedTerm.status)}>
                    {formatStatus(selectedTerm.status)}
                  </TiStatusPill>
                }
              />
              <TiFieldLine label="Notas" value={getText(selectedTerm.notes)} />
            </>
          ) : (
            <div className="flex min-h-32 items-center justify-center text-center text-sm font-medium text-slate-500 dark:text-slate-400">
              Selecione um termo para ver os detalhes.
            </div>
          )}
        </TiDetailPanel>
      </div>

      <Dialog
        open={dialogState?.type === "term"}
        onOpenChange={(open) => {
          if (!open) {
            closeDialog();
          }
        }}
        title={
          dialogState?.type === "term" && dialogState.mode === "edit"
            ? "Editar termo"
            : "Novo termo"
        }
        description="Cadastro de termo de responsabilidade."
      >
        <form className="space-y-4" onSubmit={handleSubmitTerm}>
          {dialogError ? <TiInlineNotice tone="danger">{dialogError}</TiInlineNotice> : null}
          <div className="grid gap-3 md:grid-cols-2">
            <TiTextField
              label="Titulo"
              name="title"
              required
              defaultValue={dialogState?.type === "term" ? getText(dialogState.term?.title, "") : ""}
            />
            <TiNativeSelect
              label="Status"
              name="status"
              defaultValue={
                dialogState?.type === "term"
                  ? normalizeStatus(dialogState.term?.status || "draft")
                  : "draft"
              }
              options={TERM_FORM_STATUS_OPTIONS}
            />
            <TiNativeSelect
              label="Ativo"
              name="inventory_id"
              defaultValue={
                dialogState?.type === "term"
                  ? getText(dialogState.term?.inventory_id ?? dialogState.term?.asset_id, "")
                  : ""
              }
              options={assetOptions}
            />
            <TiTextField
              label="ID do usuario"
              name="user_id"
              defaultValue={dialogState?.type === "term" ? getText(dialogState.term?.user_id, "") : ""}
            />
            <TiTextField
              label="Nome do usuario"
              name="user_name"
              defaultValue={
                dialogState?.type === "term"
                  ? getText(dialogState.term?.user_name ?? dialogState.term?.assignee_name, "")
                  : ""
              }
            />
            <TiTextField
              label="Descricao"
              name="description"
              defaultValue={
                dialogState?.type === "term" ? getText(dialogState.term?.description, "") : ""
              }
            />
          </div>
          <TiTextarea
            label="Conteudo"
            name="content"
            defaultValue={dialogState?.type === "term" ? getText(dialogState.term?.content, "") : ""}
          />
          <TiTextarea
            label="Notas"
            name="notes"
            defaultValue={dialogState?.type === "term" ? getText(dialogState.term?.notes, "") : ""}
          />
          <div className="flex justify-end gap-2">
            <button type="button" className="h-10 px-4 text-sm font-semibold" onClick={closeDialog}>
              Cancelar
            </button>
            <TiIconAction
              icon={Plus}
              type="submit"
              label={isTermSubmitting ? "Salvando..." : "Salvar termo"}
              variant="primary"
              disabled={isTermSubmitting || !canManage}
            />
          </div>
        </form>
      </Dialog>

      <Dialog
        open={dialogState?.type === "sign"}
        onOpenChange={(open) => {
          if (!open) {
            closeDialog();
          }
        }}
        title="Assinar termo"
        description="Assinatura de termo de responsabilidade."
      >
        <form className="space-y-4" onSubmit={handleSubmitSign}>
          {dialogError ? <TiInlineNotice tone="danger">{dialogError}</TiInlineNotice> : null}
          <TiInlineNotice tone="warning">
            A assinatura sera registrada apos a confirmacao.
          </TiInlineNotice>
          <TiTextField label="Nome do assinante" name="signer_name" />
          <TiTextarea label="Observacao" name="notes" />
          <div className="flex justify-end gap-2">
            <button type="button" className="h-10 px-4 text-sm font-semibold" onClick={closeDialog}>
              Cancelar
            </button>
            <TiIconAction
              icon={Signature}
              type="submit"
              label={signTermMutation.isPending ? "Assinando..." : "Assinar termo"}
              variant="primary"
              disabled={signTermMutation.isPending || !canSign}
            />
          </div>
        </form>
      </Dialog>
    </TiPanel>
  );
}
