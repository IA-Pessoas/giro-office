import { useMemo, useState, type FormEvent } from "react";
import { Eye, FileCheck2, Pencil, Plus, Printer, Save, Signature, X } from "lucide-react";
import { toast } from "react-toastify";

import { useModuleAccess } from "@modules/auth";
import { departmentService, type DepItem } from "@modules/departments";
import { useAssignableUsers } from "@modules/rh";
import { Dialog } from "@shared/components/ui/Dialog";
import { StatusBadge, type StatusBadgeConfig } from "@shared/components/StatusBadge";
import { useFetch } from "@shared/hooks";
import { cn } from "@shared/ui/newLayout/utils";

import {
  useCreateTiTermMutation,
  useSignTiTermMutation,
  useTiInventory,
  useTiTerm,
  useTiTerms,
  useUpdateTiTermMutation,
} from "../hooks";
import type { TiId, TiInventoryAsset, TiTerm, TiTermUpdatePayload } from "../types";
import { TiNativeSelect } from "./TiNativeSelect";
import {
  TiDataTable,
  TiEmptyState,
  TiFieldLine,
  TiIconAction,
  TiInlineNotice,
  TiPanel,
  TiQueryStatePanel,
  TiSectionHeader,
  TiTableAction,
  TiTextarea,
  TiTextField,
} from "./tiFormControls";
import {
  tiCompactButtonClassName,
  tiPrimaryButtonClassName,
  tiSecondaryButtonClassName,
  tiStatusBadgeClassName,
} from "./tiWorkspaceUi";

type TermsDialogState =
  | { type: "term"; mode: "create"; term?: undefined }
  | { type: "term"; mode: "edit"; term: TiTerm }
  | { type: "sign"; term: TiTerm };

const TERM_STATUS_OPTIONS = [
  { value: "", label: "Todos" },
  { value: "pending", label: "Pendente" },
  { value: "signed", label: "Assinado" },
];

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

  if (normalized === "pending") {
    return "Pendente";
  }

  if (normalized === "signed") {
    return "Assinado";
  }

  return getText(status, "Sem status");
}

function getStatusBadgeConfig(status: unknown): StatusBadgeConfig {
  const normalized = normalizeStatus(status);

  if (normalized === "signed") {
    return { label: formatStatus(status), variant: "success" };
  }

  if (normalized === "pending") {
    return { label: formatStatus(status), variant: "warning" };
  }

  return { label: formatStatus(status), variant: "neutral" };
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

function getDateInputValue(value: unknown): string {
  if (!value) {
    return new Date().toISOString().slice(0, 10);
  }

  const date = new Date(String(value));

  if (Number.isNaN(date.getTime())) {
    return String(value).slice(0, 10);
  }

  return date.toISOString().slice(0, 10);
}

function getAssetCode(asset?: TiInventoryAsset | null): string {
  return getText(asset?.asset_code ?? asset?.code ?? asset?.patrimony_code ?? asset?.serial_number, "");
}

function getAssetTitle(asset: TiInventoryAsset): string {
  return getText(asset.name ?? getAssetCode(asset), "Ativo sem nome");
}

function getTermTitle(term: TiTerm): string {
  if (term.title) {
    return getText(term.title, "Termo sem título");
  }

  if (term.user_name) {
    return `Termo de ${getText(term.user_name, "usuário")}`;
  }

  return getText(term.asset_code, "Termo sem usuário");
}

function getTermUser(term: TiTerm): string {
  return getText(
    term.user_name ?? term.assignee_name ?? term.user?.full_name ?? term.user?.name ?? term.user_id,
  );
}

function getTermAsset(term: TiTerm): string {
  return getText(term.asset_code ?? term.equipament_list, "Ativo não informado");
}

function hasTermSignature(term?: TiTerm | null): boolean {
  return Boolean(String(term?.reason ?? "").trim());
}

function getTermStatus(term?: TiTerm | null): "pending" | "signed" {
  return hasTermSignature(term) ? "signed" : "pending";
}

function getMutationErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Não foi possível concluir a ação.";
}

function getSearchableText(values: unknown[]): string {
  return values.map((value) => getText(value, "")).join(" ").toLowerCase();
}

function escapeHtml(value: unknown): string {
  return getText(value, "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildPrintableTermHtml(term: TiTerm, departmentName: string): string {
  const rows = [
    ["Usuário", getTermUser(term)],
    ["CPF", term.user_cpf],
    ["Departamento", departmentName],
    ["Data", formatDate(term.date)],
    ["Endereço", term.address],
    ["Equipamento", term.equipament_list],
    ["Marca", term.brand],
    ["Código", term.asset_code],
    ["IMEI", term.imei],
    ["Status", formatStatus(getTermStatus(term))],
    ["Motivo", term.reason],
  ];

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(getTermTitle(term))}</title>
    <style>
      @page { margin: 18mm; }
      body { color: #0f172a; font-family: Arial, sans-serif; font-size: 13px; line-height: 1.5; }
      h1 { font-size: 22px; margin: 0 0 4px; }
      .subtitle { color: #475569; margin: 0 0 24px; }
      table { border-collapse: collapse; width: 100%; }
      th, td { border: 1px solid #cbd5e1; padding: 10px 12px; text-align: left; vertical-align: top; }
      th { background: #f1f5f9; width: 180px; }
      .signature { display: grid; gap: 32px; grid-template-columns: 1fr 1fr; margin-top: 56px; }
      .line { border-top: 1px solid #0f172a; padding-top: 8px; text-align: center; }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(getTermTitle(term))}</h1>
    <p class="subtitle">Termo de responsabilidade de TI</p>
    <table>
      <tbody>
        ${rows
          .map(
            ([label, value]) =>
              `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`,
          )
          .join("")}
      </tbody>
    </table>
    <div class="signature">
      <div class="line">Responsável</div>
      <div class="line">Tecnologia da Informação</div>
    </div>
  </body>
</html>`;
}

export function TiTermsTab() {
  const { access } = useModuleAccess("ti");
  const canManage = access.isAdmin;
  const canSign = access.canView;
  const [search, setSearch] = useState("");
  const [termStatus, setTermStatus] = useState("");
  const [assetId, setAssetId] = useState("");
  const [selectedTermId, setSelectedTermId] = useState<TiId | undefined>();
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [dialogState, setDialogState] = useState<TermsDialogState | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const termsQuery = useTiTerms();
  const assetsQuery = useTiInventory(
    { status: "available", page_size: 100 },
    { enabled: canManage },
  );
  const assignableUsersQuery = useAssignableUsers({ enabled: canManage });
  const departmentsQuery = useFetch<DepItem[]>(
    ["ti-terms", "departments"],
    () => departmentService.list(),
    { retry: false, enabled: canManage },
  );
  const selectedTermQuery = useTiTerm(selectedTermId, { enabled: Boolean(selectedTermId) });
  const createTermMutation = useCreateTiTermMutation();
  const updateTermMutation = useUpdateTiTermMutation();
  const signTermMutation = useSignTiTermMutation();
  const assignableUsers = assignableUsersQuery.data ?? [];

  const assetsById = useMemo(
    () => new Map((assetsQuery.data ?? []).map((asset) => [String(asset.id), asset])),
    [assetsQuery.data],
  );

  const assetsByCode = useMemo(
    () =>
      new Map(
        (assetsQuery.data ?? []).map((asset) => [normalizeStatus(getAssetCode(asset)), asset]),
      ),
    [assetsQuery.data],
  );

  const departmentsById = useMemo(
    () => new Map((departmentsQuery.data ?? []).map((department) => [String(department.id), department])),
    [departmentsQuery.data],
  );

  const assetOptions = useMemo(
    () =>
      (assetsQuery.data ?? []).map((asset) => ({
        value: String(asset.id),
        label: getAssetTitle(asset),
      })),
    [assetsQuery.data],
  );

  const assetFilterOptions = useMemo(() => {
    if (!canManage) {
      return [{ value: "", label: "Todos" }];
    }

    return [{ value: "", label: "Todos" }, ...assetOptions];
  }, [assetOptions, canManage]);

  const assetFormOptions = useMemo(
    () => [{ value: "", label: "Selecione" }, ...assetOptions],
    [assetOptions],
  );

  const departmentOptions = useMemo(
    () => [
      { value: "", label: "Selecione" },
      ...(departmentsQuery.data ?? []).map((department) => ({
        value: String(department.id),
        label: getText(department.name, "Departamento sem nome"),
      })),
    ],
    [departmentsQuery.data],
  );

  const assignableUserOptions = useMemo(
    () => [
      { value: "", label: "Selecione" },
      ...assignableUsers.map((user) => ({
        value: user.id,
        label: user.departmentName ? `${user.name} - ${user.departmentName}` : user.name,
      })),
    ],
    [assignableUsers],
  );

  const filteredTerms = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const selectedAsset = assetsById.get(String(assetId));
    const selectedAssetCode = getAssetCode(selectedAsset);

    return (termsQuery.data ?? []).filter((term) => {
      const statusMatches = !termStatus || getTermStatus(term) === termStatus;
      const assetMatches =
        !assetId ||
        normalizeStatus(term.asset_code) === normalizeStatus(selectedAssetCode) ||
        normalizeStatus(term.equipament_list).includes(normalizeStatus(selectedAssetCode));
      const searchableText = getSearchableText([
        getTermTitle(term),
        getTermUser(term),
        term.user_cpf,
        term.asset_code,
        term.equipament_list,
        term.brand,
        term.imei,
        term.reason,
      ]);

      return statusMatches && assetMatches && (!normalizedSearch || searchableText.includes(normalizedSearch));
    });
  }, [assetId, assetsById, search, termStatus, termsQuery.data]);

  const selectedListTerm = (termsQuery.data ?? []).find(
    (term) => String(term.id) === String(selectedTermId),
  );
  const selectedTerm = selectedTermQuery.data ?? selectedListTerm;
  const isEditingTerm = dialogState?.type === "term" && dialogState.mode === "edit";

  function getDepartmentName(id: unknown): string {
    return getText(departmentsById.get(String(id))?.name);
  }

  function getSelectedAssetIdByCode(assetCode: unknown): string {
    const normalizedCode = normalizeStatus(assetCode);
    const asset = assetsByCode.get(normalizedCode);

    return asset ? String(asset.id) : "";
  }

  function closeDialog() {
    setDialogState(null);
    setDialogError(null);
  }

  function openDialog(nextDialogState: TermsDialogState) {
    setDialogError(null);
    setDialogState(nextDialogState);
  }

  function openTermDetail(termId: TiId) {
    setSelectedTermId(termId);
    setIsDetailDialogOpen(true);
  }

  function handlePrintTerm(term: TiTerm) {
    const printWindow = window.open("", "_blank", "width=900,height=1100");

    if (!printWindow) {
      toast.error(
        "Não foi possível abrir a janela de impressão. Verifique o bloqueador de pop-ups do navegador.",
      );
      return;
    }

    printWindow.document.write(buildPrintableTermHtml(term, getDepartmentName(term.department_id)));
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }

  async function handleSubmitTerm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canManage || dialogState?.type !== "term") {
      return;
    }

    const formData = new FormData(event.currentTarget);
    const selectedAssetId = getFormText(formData, "selected_asset_id");
    const selectedAsset = assetsById.get(String(selectedAssetId));
    const selectedAssetCode = getAssetCode(selectedAsset);
    const selectedUserId = getFormText(formData, "user_id");
    const payload: TiTermUpdatePayload = compactPayload({
      date: getFormText(formData, "date"),
      department_id: getFormText(formData, "department_id"),
      address: getFormText(formData, "address"),
      reason: getFormText(formData, "reason"),
      equipament_list: getFormText(formData, "equipament_list"),
      brand: getFormText(formData, "brand"),
      asset_code: getFormText(formData, "asset_code"),
      imei: getFormText(formData, "imei"),
    });

    if (!payload.asset_code && selectedAssetCode) {
      payload.asset_code = selectedAssetCode;
    }

    if (!payload.equipament_list && selectedAsset) {
      payload.equipament_list = getAssetTitle(selectedAsset);
    }

    if (!payload.brand && selectedAsset?.brand) {
      payload.brand = getText(selectedAsset.brand, "");
    }

    try {
      setDialogError(null);

      if (isEditingTerm) {
        await updateTermMutation.mutateAsync({ id: dialogState.term.id, payload });
      } else {
        const createdTerm = await createTermMutation.mutateAsync({
          ...payload,
          user_id: selectedUserId,
        });
        setSelectedTermId(createdTerm.id);
        setIsDetailDialogOpen(true);
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
          reason: getFormText(formData, "reason"),
        }),
      });
      setSelectedTermId(dialogState.term.id);
      setIsDetailDialogOpen(true);
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
        description="Acompanhe termos de responsabilidade, assinatura e vínculo com ativos."
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
          placeholder="Usuário, CPF ou ativo"
        />
        <TiNativeSelect
          label="Status"
          value={termStatus}
          onChange={(event) => setTermStatus(event.target.value)}
          options={TERM_STATUS_OPTIONS}
        />
        <TiNativeSelect
          label="Ativo"
          value={assetId}
          onChange={(event) => setAssetId(event.target.value)}
          options={assetFilterOptions}
        />
      </div>

      <div className="grid gap-4">
        <TiQueryStatePanel
          query={termsQuery}
          emptyState={
            <TiEmptyState
              icon={FileCheck2}
              title="Nenhum termo gerado"
              description="Os termos assinados ou pendentes ficam disponíveis nesta área."
            />
          }
        >
          {() =>
            filteredTerms.length > 0 ? (
              <TiDataTable headers={["Termo", "Ativo", "Usuário", "Data", "Status", ""]}>
                {filteredTerms.map((term) => {
                  const isSelected = String(term.id) === String(selectedTermId);
                  const termStatusValue = getTermStatus(term);

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
                          onClick={() => openTermDetail(term.id)}
                        >
                          {getTermTitle(term)}
                        </button>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          {getText(term.user_cpf)}
                        </p>
                      </td>
                      <td className="px-4 py-3">{getTermAsset(term)}</td>
                      <td className="px-4 py-3">{getTermUser(term)}</td>
                      <td className="px-4 py-3">{formatDate(term.date)}</td>
                      <td className="px-4 py-3">
                        <StatusBadge
                          config={getStatusBadgeConfig(termStatusValue)}
                          className={tiStatusBadgeClassName}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <TiTableAction
                            icon={Eye}
                            label="Detalhes"
                            onClick={() => openTermDetail(term.id)}
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
            ) : (
              <TiEmptyState
                icon={FileCheck2}
                title="Nenhum termo encontrado"
                description="Ajuste os filtros para localizar outros termos."
              />
            )
          }
        </TiQueryStatePanel>
      </div>

      <Dialog
        open={isDetailDialogOpen}
        onOpenChange={setIsDetailDialogOpen}
        title={selectedTerm ? getTermTitle(selectedTerm) : "Detalhe do termo"}
        description="Detalhe cadastral e assinatura do termo."
        contentClassName="w-[min(92vw,760px)] overflow-hidden border-slate-300 shadow-2xl dark:border-slate-700"
        bodyClassName="space-y-3 bg-slate-100/70 !px-4 !py-3 dark:bg-slate-950/50"
      >
        <div className="mx-auto max-w-2xl rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 sm:p-4">
          {selectedTermQuery.isLoading ? (
            <TiFieldLine label="Status" value="Carregando..." />
          ) : selectedTermQuery.isError ? (
            <TiInlineNotice tone="danger">
              {selectedTermQuery.error?.message ?? "Não foi possível carregar o detalhe."}
            </TiInlineNotice>
          ) : selectedTerm ? (
            <>
              <div className="mb-3 flex justify-end">
                <button
                  type="button"
                  className={cn(tiSecondaryButtonClassName, tiCompactButtonClassName)}
                  onClick={() => handlePrintTerm(selectedTerm)}
                >
                  <Printer className="h-3.5 w-3.5" />
                  <span>Imprimir / PDF</span>
                </button>
              </div>
              <div className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
                <TiFieldLine label="Termo" value={getTermTitle(selectedTerm)} />
                <TiFieldLine label="Usuário" value={getTermUser(selectedTerm)} />
                <TiFieldLine label="CPF" value={getText(selectedTerm.user_cpf)} />
                <TiFieldLine label="Departamento" value={getDepartmentName(selectedTerm.department_id)} />
                <TiFieldLine label="Data" value={formatDate(selectedTerm.date)} />
                <TiFieldLine label="Endereço" value={getText(selectedTerm.address)} />
                <TiFieldLine label="Equipamento" value={getText(selectedTerm.equipament_list)} />
                <TiFieldLine label="Marca" value={getText(selectedTerm.brand)} />
                <TiFieldLine label="Código" value={getText(selectedTerm.asset_code)} />
                <TiFieldLine label="IMEI" value={getText(selectedTerm.imei)} />
                <TiFieldLine
                  label="Status"
                  value={
                    <StatusBadge
                      config={getStatusBadgeConfig(getTermStatus(selectedTerm))}
                      className={tiStatusBadgeClassName}
                    />
                  }
                />
                <TiFieldLine label="Motivo" value={getText(selectedTerm.reason)} />
              </div>
            </>
          ) : (
            <div className="flex min-h-32 items-center justify-center text-center text-sm font-medium text-slate-500 dark:text-slate-400">
              Selecione um termo para ver os detalhes.
            </div>
          )}
        </div>
      </Dialog>

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
        contentClassName="w-[min(92vw,860px)] max-h-[84vh] overflow-hidden"
        bodyClassName="max-h-[calc(84vh-73px)] overflow-y-auto overscroll-contain"
      >
        <form className="space-y-3" onSubmit={handleSubmitTerm}>
          {dialogError ? <TiInlineNotice tone="danger">{dialogError}</TiInlineNotice> : null}
          <div className="grid gap-3 md:grid-cols-2">
            {isEditingTerm ? (
              <>
                <TiTextField
                  label="Nome do usuário"
                  value={getText(dialogState.term.user_name, "")}
                  readOnly
                />
                <TiTextField
                  label="CPF do usuário"
                  value={getText(dialogState.term.user_cpf, "")}
                  readOnly
                />
                <TiTextField
                  label="ID do usuário"
                  value={getText(dialogState.term.user_id, "")}
                  readOnly
                />
              </>
            ) : (
              <TiNativeSelect
                label="Usuário"
                name="user_id"
                required
                disabled={assignableUsersQuery.isLoading}
                options={assignableUserOptions}
              />
            )}
            <TiNativeSelect
              label="Departamento"
              name="department_id"
              defaultValue={
                dialogState?.type === "term" ? getText(dialogState.term?.department_id, "") : ""
              }
              options={departmentOptions}
            />
            <TiNativeSelect
              label="Ativo"
              name="selected_asset_id"
              defaultValue={
                dialogState?.type === "term"
                  ? getSelectedAssetIdByCode(dialogState.term?.asset_code)
                  : ""
              }
              options={assetFormOptions}
            />
            <TiTextField
              label="Código do ativo"
              name="asset_code"
              defaultValue={dialogState?.type === "term" ? getText(dialogState.term?.asset_code, "") : ""}
            />
            <TiTextField
              label="Marca"
              name="brand"
              defaultValue={dialogState?.type === "term" ? getText(dialogState.term?.brand, "") : ""}
            />
            <TiTextField
              label="IMEI"
              name="imei"
              defaultValue={dialogState?.type === "term" ? getText(dialogState.term?.imei, "") : ""}
            />
            <TiTextField
              label="Data"
              name="date"
              type="date"
              required
              defaultValue={
                dialogState?.type === "term"
                  ? getDateInputValue(dialogState.term?.date)
                  : getDateInputValue(null)
              }
            />
            <TiTextField
              label="Endereço"
              name="address"
              defaultValue={dialogState?.type === "term" ? getText(dialogState.term?.address, "") : ""}
            />
            <TiTextarea
              label="Equipamentos"
              name="equipament_list"
              className="min-h-20"
              defaultValue={
                dialogState?.type === "term" ? getText(dialogState.term?.equipament_list, "") : ""
              }
            />
            <TiTextarea
              label="Motivo"
              name="reason"
              className="min-h-20"
              defaultValue={dialogState?.type === "term" ? getText(dialogState.term?.reason, "") : ""}
            />
          </div>
          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-3 dark:border-slate-700">
            <button
              type="button"
              className={cn(tiSecondaryButtonClassName, tiCompactButtonClassName)}
              onClick={closeDialog}
              disabled={isTermSubmitting}
            >
              <X className="h-3.5 w-3.5" />
              <span>Cancelar</span>
            </button>
            <button
              type="submit"
              className={cn(tiPrimaryButtonClassName, tiCompactButtonClassName)}
              disabled={isTermSubmitting || !canManage}
            >
              <Save className="h-3.5 w-3.5" />
              <span>{isTermSubmitting ? "Salvando..." : "Salvar termo"}</span>
            </button>
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
            A assinatura será registrada após a confirmação.
          </TiInlineNotice>
          <TiTextarea label="Motivo" name="reason" />
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className={cn(tiSecondaryButtonClassName, tiCompactButtonClassName)}
              onClick={closeDialog}
              disabled={signTermMutation.isPending}
            >
              <X className="h-3.5 w-3.5" />
              <span>Cancelar</span>
            </button>
            <button
              type="submit"
              className={cn(tiPrimaryButtonClassName, tiCompactButtonClassName)}
              disabled={signTermMutation.isPending || !canSign}
            >
              <Signature className="h-3.5 w-3.5" />
              <span>{signTermMutation.isPending ? "Assinando..." : "Assinar termo"}</span>
            </button>
          </div>
        </form>
      </Dialog>
    </TiPanel>
  );
}
