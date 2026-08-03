import { useMemo, useState, type FormEvent } from "react";
import { Boxes, Eye, Pencil, Plus, RotateCcw, Save, Tags, UserPlus, X } from "lucide-react";

import { useModuleAccess } from "@modules/auth";
import { departmentService, type DepItem } from "@modules/departments";
import { useAssignableUsers } from "@modules/rh";
import { ConfirmationDialog } from "@shared/components";
import { Dialog } from "@shared/components/ui/Dialog";
import { StatusBadge, type StatusBadgeConfig } from "@shared/components/StatusBadge";
import { useFetch } from "@shared/hooks";
import { cn } from "@shared/ui/newLayout/utils";

import {
  useAssignTiInventoryAssetUserMutation,
  useCreateTiInventoryAssetMutation,
  useCreateTiInventoryCategoryMutation,
  useReturnTiInventoryAssetMutation,
  useTiInventory,
  useTiInventoryAsset,
  useTiInventoryCategories,
  useUpdateTiInventoryAssetMutation,
  useUpdateTiInventoryCategoryMutation,
} from "../hooks";
import type {
  TiId,
  TiInventoryAsset,
  TiInventoryAssignUserPayload,
  TiInventoryCategory,
  TiInventoryReturnPayload,
} from "../types";
import { getTiInventoryMutationErrorMessage } from "../utils/inventoryMutationError";
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
  tiDialogSubsectionClassName,
  tiPrimaryButtonClassName,
  tiSecondaryButtonClassName,
  tiStatusBadgeClassName,
} from "./tiWorkspaceUi";

type InventoryDialogState =
  | { type: "asset"; mode: "create"; asset?: undefined }
  | { type: "asset"; mode: "edit"; asset: TiInventoryAsset }
  | { type: "assign"; asset: TiInventoryAsset }
  | { type: "return"; asset: TiInventoryAsset }
  | { type: "categories" };

type PendingInventoryAction =
  | { type: "assign"; asset: TiInventoryAsset; payload: TiInventoryAssignUserPayload }
  | { type: "return"; asset: TiInventoryAsset; payload: TiInventoryReturnPayload };

const INVENTORY_STATUS_OPTIONS = [
  { value: "", label: "Todos" },
  { value: "available", label: "Disponível" },
  { value: "assigned", label: "Atribuído" },
];

const ACTIVE_STATUS_OPTIONS = [
  { value: "active", label: "Ativo" },
  { value: "inactive", label: "Inativo" },
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
  if (typeof status === "boolean") {
    return status ? "active" : "inactive";
  }

  return String(status ?? "").trim().toLowerCase();
}

function formatStatus(status: unknown): string {
  const normalized = normalizeStatus(status);

  if (normalized === "available") {
    return "Disponível";
  }

  if (normalized === "assigned") {
    return "Atribuído";
  }

  if (normalized === "maintenance") {
    return "Manutenção";
  }

  if (normalized === "retired") {
    return "Baixado";
  }

  if (normalized === "active") {
    return "Ativo";
  }

  if (normalized === "inactive") {
    return "Inativo";
  }

  return getText(status, "Sem status");
}

function getStatusBadgeConfig(status: unknown): StatusBadgeConfig {
  const normalized = normalizeStatus(status);

  if (normalized === "available" || normalized === "active") {
    return { label: formatStatus(status), variant: "success" };
  }

  if (normalized === "assigned") {
    return { label: formatStatus(status), variant: "info" };
  }

  if (normalized === "maintenance") {
    return { label: formatStatus(status), variant: "warning" };
  }

  if (normalized === "retired" || normalized === "inactive") {
    return { label: formatStatus(status), variant: "neutral" };
  }

  return { label: formatStatus(status), variant: "neutral" };
}

function getCatalogStatus(
  item?: { status?: unknown; active?: boolean | null; is_active?: boolean | null } | null,
): unknown {
  if (!item) {
    return undefined;
  }

  return item.status ?? item.active ?? item.is_active;
}

function getRelatedUserName(value: unknown): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const record = value as Record<string, unknown>;

  for (const key of ["full_name", "name", "login", "email"]) {
    const field = record[key];

    if (typeof field === "string" && field.trim()) {
      return field;
    }
  }

  return undefined;
}

function getAssetTitle(asset: TiInventoryAsset): string {
  return getText(
    asset.asset_code ?? asset.name ?? asset.code ?? asset.patrimony_code,
    "Ativo sem código",
  );
}

function getAssetCode(asset: TiInventoryAsset): string {
  return getText(asset.asset_code ?? asset.code ?? asset.patrimony_code ?? asset.serial_number);
}

function getAssignedUser(asset: TiInventoryAsset): string {
  return getText(
    getRelatedUserName(asset.user) ??
      asset.user_id ??
      asset.assigned_user_name ??
      asset.assigned_to_user_name ??
      asset.assigned_user_id ??
      asset.assigned_to_user_id,
  );
}

function getItResponsible(asset: TiInventoryAsset): string {
  return getText(getRelatedUserName(asset.responsible_it_staff) ?? asset.responsible_it_staff_id);
}

function getLegacySelectedUserLabel(
  asset: TiInventoryAsset,
  relation: "user" | "responsible_it_staff",
): string {
  if (relation === "user") {
    return `Usuário atual: ${getText(getRelatedUserName(asset.user) ?? asset.user_id)}`;
  }

  return `Responsável atual: ${getText(
    getRelatedUserName(asset.responsible_it_staff) ?? asset.responsible_it_staff_id,
  )}`;
}

function getAssetStatus(asset: TiInventoryAsset): string {
  if (asset.status) {
    return String(asset.status);
  }

  return asset.user_id || asset.user ? "assigned" : "available";
}

export function TiInventoryTab() {
  const { access } = useModuleAccess("ti");
  const canManage = access.canEdit || access.isAdmin;
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [selectedAssetId, setSelectedAssetId] = useState<TiId | undefined>();
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [dialogState, setDialogState] = useState<InventoryDialogState | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingInventoryAction | null>(null);
  const [confirmationError, setConfirmationError] = useState<string | null>(null);
  const [editingCategory, setEditingCategory] = useState<TiInventoryCategory | null>(null);
  const isUserSelectorEnabled =
    canManage && (dialogState?.type === "asset" || dialogState?.type === "assign");
  const assetUsersQuery = useAssignableUsers({ enabled: isUserSelectorEnabled });
  const technologyResponsibleUsersQuery = useAssignableUsers({
    enabled: isUserSelectorEnabled && dialogState?.type === "asset",
    departmentName: "Tecnologia",
  });

  const filters = useMemo(
    () =>
      compactPayload({
        asset_code: search,
        category_id: categoryId,
        location_id: departmentId,
      }),
    [categoryId, departmentId, search],
  );

  const inventoryQuery = useTiInventory(filters);
  const categoriesQuery = useTiInventoryCategories();
  const departmentsQuery = useFetch<DepItem[]>(
    ["ti-inventory", "departments"],
    () => departmentService.list(),
    { retry: false },
  );
  const selectedAssetQuery = useTiInventoryAsset(selectedAssetId, { enabled: Boolean(selectedAssetId) });

  const createAssetMutation = useCreateTiInventoryAssetMutation();
  const updateAssetMutation = useUpdateTiInventoryAssetMutation();
  const assignUserMutation = useAssignTiInventoryAssetUserMutation();
  const returnAssetMutation = useReturnTiInventoryAssetMutation();
  const createCategoryMutation = useCreateTiInventoryCategoryMutation();
  const updateCategoryMutation = useUpdateTiInventoryCategoryMutation();

  const categoriesById = useMemo(
    () => new Map((categoriesQuery.data ?? []).map((category) => [String(category.id), category])),
    [categoriesQuery.data],
  );

  const departmentsById = useMemo(
    () => new Map((departmentsQuery.data ?? []).map((department) => [String(department.id), department])),
    [departmentsQuery.data],
  );

  const categoryOptions = useMemo(
    () => [
      { value: "", label: "Todas" },
      ...(categoriesQuery.data ?? []).map((category) => ({
        value: String(category.id),
        label: getText(category.name, "Categoria sem nome"),
      })),
    ],
    [categoriesQuery.data],
  );

  const departmentOptions = useMemo(
    () =>
      (departmentsQuery.data ?? []).map((department) => ({
        value: String(department.id),
        label: getText(department.name, "Departamento sem nome"),
      })),
    [departmentsQuery.data],
  );

  const departmentFilterOptions = useMemo(
    () => [{ value: "", label: "Todos" }, ...departmentOptions],
    [departmentOptions],
  );

  const departmentFormOptions = useMemo(
    () => [{ value: "", label: "Selecione" }, ...departmentOptions],
    [departmentOptions],
  );

  const assetUserOptions = useMemo(
    () => [
      { value: "", label: "NÃ£o atribuir" },
      ...(assetUsersQuery.data ?? []).map((user) => ({
        value: user.id,
        label: user.name,
      })),
    ],
    [assetUsersQuery.data],
  );

  const technologyResponsibleOptions = useMemo(
    () => [
      { value: "", label: "NÃ£o atribuir" },
      ...(technologyResponsibleUsersQuery.data ?? []).map((user) => ({
        value: user.id,
        label: user.name,
      })),
    ],
    [technologyResponsibleUsersQuery.data],
  );

  function hasAssignableUser(
    userId: unknown,
    users: typeof assetUsersQuery.data | typeof technologyResponsibleUsersQuery.data,
  ): boolean {
    return Boolean(userId) && (users ?? []).some((user) => user.id === userId);
  }

  const filteredInventory = useMemo(() => {
    const assets = inventoryQuery.data ?? [];

    if (!status) {
      return assets;
    }

    return assets.filter((asset) => normalizeStatus(getAssetStatus(asset)) === status);
  }, [inventoryQuery.data, status]);

  const selectedListAsset = (inventoryQuery.data ?? []).find(
    (asset) => String(asset.id) === String(selectedAssetId),
  );
  const selectedAsset = selectedAssetQuery.data ?? selectedListAsset;

  function getCategoryName(id: unknown, fallback?: unknown): string {
    return getText(categoriesById.get(String(id))?.name ?? fallback);
  }

  function getDepartmentName(id: unknown, fallback?: unknown): string {
    return getText(departmentsById.get(String(id))?.name ?? fallback);
  }

  function closeDialog() {
    setDialogState(null);
    setDialogError(null);
    setEditingCategory(null);
  }

  function openDialog(nextDialogState: InventoryDialogState) {
    setDialogError(null);
    setDialogState(nextDialogState);
  }

  function openAssetDetail(assetId: TiId) {
    setSelectedAssetId(assetId);
    setIsDetailDialogOpen(true);
  }

  function startEditingCategory(category: TiInventoryCategory) {
    setDialogError(null);
    setEditingCategory(category);
  }

  async function handleSubmitAsset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canManage || dialogState?.type !== "asset") {
      return;
    }

    const formData = new FormData(event.currentTarget);
    const payload = compactPayload({
      asset_code: getFormText(formData, "asset_code"),
      category_id: getFormText(formData, "category_id"),
      location_id: getFormText(formData, "location_id"),
      user_id: getFormText(formData, "user_id"),
      responsible_it_staff_id: getFormText(formData, "responsible_it_staff_id"),
      notes: getFormText(formData, "notes"),
    });

    try {
      setDialogError(null);

      if (dialogState.mode === "edit") {
        await updateAssetMutation.mutateAsync({ id: dialogState.asset.id, payload });
      } else {
        const createdAsset = await createAssetMutation.mutateAsync(payload);
        setSelectedAssetId(createdAsset.id);
        setIsDetailDialogOpen(true);
      }

      closeDialog();
    } catch (error) {
      setDialogError(getTiInventoryMutationErrorMessage(error));
    }
  }

  function handleSubmitAssign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canManage || dialogState?.type !== "assign") {
      return;
    }

    const formData = new FormData(event.currentTarget);
    const userId = getFormText(formData, "user_id");

    setConfirmationError(null);
    setPendingAction({
      type: "assign",
      asset: dialogState.asset,
      payload: compactPayload({ user_id: userId }),
    });
  }

  function handleSubmitReturn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canManage || dialogState?.type !== "return") {
      return;
    }

    const formData = new FormData(event.currentTarget);

    setConfirmationError(null);
    setPendingAction({
      type: "return",
      asset: dialogState.asset,
      payload: compactPayload({ notes: getFormText(formData, "notes") }),
    });
  }

  async function handleConfirmPendingAction() {
    if (!pendingAction) {
      return;
    }

    try {
      setConfirmationError(null);

      if (pendingAction.type === "assign") {
        await assignUserMutation.mutateAsync({
          id: pendingAction.asset.id,
          payload: pendingAction.payload,
        });
      } else {
        await returnAssetMutation.mutateAsync({
          id: pendingAction.asset.id,
          payload: pendingAction.payload,
        });
      }

      setSelectedAssetId(pendingAction.asset.id);
      closeDialog();
    } catch (error) {
      const actionLabel = pendingAction.type === "assign" ? "atribuir o ativo" : "registrar a devolução";

      setConfirmationError(
        `Não foi possível ${actionLabel}: ${getTiInventoryMutationErrorMessage(error)}`,
      );
      throw error;
    }
  }

  async function handleSubmitCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canManage) {
      return;
    }

    const categoryForm = event.currentTarget;
    const formData = new FormData(categoryForm);
    const categoryActive = getFormText(formData, "active");
    const payload = compactPayload(
      editingCategory
        ? {
            name: getFormText(formData, "name"),
            tag: getFormText(formData, "tag"),
            active: categoryActive ? categoryActive === "active" : undefined,
          }
        : {
            name: getFormText(formData, "name"),
            tag: getFormText(formData, "tag"),
          },
    );

    try {
      setDialogError(null);

      if (editingCategory) {
        await updateCategoryMutation.mutateAsync({ id: editingCategory.id, payload });
      } else {
        await createCategoryMutation.mutateAsync(payload);
      }

      setEditingCategory(null);
      categoryForm.reset();
    } catch (error) {
      setDialogError(getTiInventoryMutationErrorMessage(error));
    }
  }

  const isAssetSubmitting = createAssetMutation.isPending || updateAssetMutation.isPending;
  const isCategorySubmitting =
    createCategoryMutation.isPending || updateCategoryMutation.isPending;

  return (
    <TiPanel className="space-y-5">
      <TiSectionHeader
        title="Inventário"
        description="Controle ativos, categorias, departamentos, usuários responsáveis e devoluções."
        action={
          canManage ? (
            <div className="flex flex-wrap gap-2">
              <TiIconAction
                icon={Plus}
                label="Novo ativo"
                variant="primary"
                onClick={() => openDialog({ type: "asset", mode: "create" })}
              />
              <TiIconAction
                icon={Tags}
                label="Categorias"
                onClick={() => openDialog({ type: "categories" })}
              />
            </div>
          ) : null
        }
      />

      <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/60 md:grid-cols-[minmax(240px,1.4fr)_repeat(3,minmax(160px,1fr))]">
        <TiTextField
          label="Busca"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Código patrimonial"
        />
        <TiNativeSelect
          label="Status"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          options={INVENTORY_STATUS_OPTIONS}
        />
        <TiNativeSelect
          label="Categoria"
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
          options={categoryOptions}
        />
        <TiNativeSelect
          label="Departamento"
          value={departmentId}
          onChange={(event) => setDepartmentId(event.target.value)}
          options={departmentFilterOptions}
        />
      </div>

      <div className="grid gap-4">
        <TiQueryStatePanel
          query={inventoryQuery}
          emptyState={
            <TiEmptyState
              icon={Boxes}
              title="Nenhum ativo encontrado"
              description="Os equipamentos e demais ativos de Tecnologia aparecem aqui depois do cadastro."
            />
          }
        >
          {() =>
            filteredInventory.length === 0 ? (
              <TiEmptyState
                icon={Boxes}
                title="Nenhum ativo encontrado"
                description="Ajuste os filtros para localizar os ativos de Tecnologia."
              />
            ) : (
              <TiDataTable
                headers={[
                  "Ativo",
                  "Categoria",
                  "Departamento",
                  "Usuário",
                  "Responsável TI",
                  "Status",
                  "",
                ]}
              >
                {filteredInventory.map((asset) => {
                  const isSelected = String(asset.id) === String(selectedAssetId);

                  return (
                    <tr
                      key={asset.id}
                      className={cn(
                        "text-slate-700 dark:text-slate-200",
                        isSelected ? "bg-blue-50/70 dark:bg-blue-950/20" : "",
                      )}
                    >
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          className="text-left font-semibold text-slate-900 hover:text-blue-700 dark:text-white dark:hover:text-blue-300"
                          onClick={() => openAssetDetail(asset.id)}
                        >
                          {getAssetTitle(asset)}
                        </button>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          {getAssetCode(asset)}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        {getCategoryName(asset.category_id, asset.category?.name)}
                      </td>
                      <td className="px-4 py-3">
                        {getDepartmentName(asset.location_id, asset.location?.name)}
                      </td>
                      <td className="px-4 py-3">{getAssignedUser(asset)}</td>
                      <td className="px-4 py-3">{getItResponsible(asset)}</td>
                      <td className="px-4 py-3">
                        <StatusBadge
                          config={getStatusBadgeConfig(getAssetStatus(asset))}
                          className={tiStatusBadgeClassName}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <TiTableAction
                            icon={Eye}
                            label="Detalhes"
                            onClick={() => openAssetDetail(asset.id)}
                          />
                          {canManage ? (
                            <>
                              <TiTableAction
                                icon={Pencil}
                                label="Editar"
                                onClick={() => openDialog({ type: "asset", mode: "edit", asset })}
                              />
                              <TiTableAction
                                icon={UserPlus}
                                label="Atribuir"
                                onClick={() => openDialog({ type: "assign", asset })}
                              />
                              <TiTableAction
                                icon={RotateCcw}
                                label="Devolver"
                                onClick={() => openDialog({ type: "return", asset })}
                              />
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </TiDataTable>
            )
          }
        </TiQueryStatePanel>
      </div>

      <Dialog
        open={isDetailDialogOpen}
        onOpenChange={setIsDetailDialogOpen}
        title={selectedAsset ? getAssetTitle(selectedAsset) : "Detalhe do ativo"}
        description="Detalhe cadastral e responsabilidade do ativo."
        contentClassName="w-[min(92vw,760px)] overflow-hidden border-slate-300 shadow-2xl dark:border-slate-700"
        bodyClassName="space-y-3 bg-slate-100/70 !px-4 !py-3 dark:bg-slate-950/50"
      >
        <div className="mx-auto max-w-2xl rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 sm:p-4">
          {selectedAssetQuery.isLoading ? (
            <TiFieldLine label="Status" value="Carregando..." />
          ) : selectedAssetQuery.isError ? (
            <TiInlineNotice tone="danger">
              {selectedAssetQuery.error?.message ?? "Não foi possível carregar o detalhe."}
            </TiInlineNotice>
          ) : selectedAsset ? (
            <div className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
              <TiFieldLine label="Ativo" value={getAssetTitle(selectedAsset)} />
              <TiFieldLine label="Código" value={getAssetCode(selectedAsset)} />
              <TiFieldLine
                label="Categoria"
                value={getCategoryName(selectedAsset.category_id, selectedAsset.category?.name)}
              />
              <TiFieldLine
                label="Departamento"
                value={getDepartmentName(selectedAsset.location_id, selectedAsset.location?.name)}
              />
              <TiFieldLine label="Usuário" value={getAssignedUser(selectedAsset)} />
              <TiFieldLine label="Responsável TI" value={getItResponsible(selectedAsset)} />
              <TiFieldLine
                label="Status"
                value={
                  <StatusBadge
                    config={getStatusBadgeConfig(getAssetStatus(selectedAsset))}
                    className={tiStatusBadgeClassName}
                  />
                }
              />
              <TiFieldLine label="Notas" value={getText(selectedAsset.notes)} />
            </div>
          ) : (
            <div className="flex min-h-32 items-center justify-center text-center text-sm font-medium text-slate-500 dark:text-slate-400">
              Selecione um ativo para ver os detalhes.
            </div>
          )}
        </div>
      </Dialog>

      <ConfirmationDialog
        open={pendingAction !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingAction(null);
            setConfirmationError(null);
          }
        }}
        title={pendingAction?.type === "assign" ? "Confirmar atribuição" : "Confirmar devolução"}
        description={
          pendingAction?.type === "assign"
            ? "Deseja atribuir este ativo ao usuário informado?"
            : "Deseja registrar a devolução deste ativo?"
        }
        onConfirm={handleConfirmPendingAction}
        isConfirming={
          pendingAction?.type === "assign" ? assignUserMutation.isPending : returnAssetMutation.isPending
        }
        errorMessage={confirmationError}
        confirmLabel={pendingAction?.type === "assign" ? "Atribuir ativo" : "Registrar devolução"}
        cancelLabel="Cancelar"
        variant={pendingAction?.type === "return" ? "destructive" : "neutral"}
      />

      <Dialog
        open={dialogState?.type === "asset"}
        onOpenChange={(open) => {
          if (!open) {
            closeDialog();
          }
        }}
        title={
          dialogState?.type === "asset" && dialogState.mode === "edit"
            ? "Editar ativo"
            : "Novo ativo"
        }
        description="Cadastro de ativo de Tecnologia."
      >
        <form className="space-y-4" onSubmit={handleSubmitAsset}>
          {dialogError ? <TiInlineNotice tone="danger">{dialogError}</TiInlineNotice> : null}
          <div className="grid gap-3 md:grid-cols-2">
            <TiTextField
              label="Código patrimonial"
              name="asset_code"
              required
              defaultValue={
                dialogState?.type === "asset" ? getText(dialogState.asset?.asset_code, "") : ""
              }
            />
            <TiNativeSelect
              label="Categoria"
              name="category_id"
              defaultValue={
                dialogState?.type === "asset" ? getText(dialogState.asset?.category_id, "") : ""
              }
              options={categoryOptions}
              required
            />
            <TiNativeSelect
              label="Departamento"
              name="location_id"
              defaultValue={
                dialogState?.type === "asset" ? getText(dialogState.asset?.location_id, "") : ""
              }
              options={departmentFormOptions}
            />
            <TiNativeSelect
              label="Usuário"
              name="user_id"
              defaultValue={dialogState?.type === "asset" ? getText(dialogState.asset?.user_id, "") : ""}
              options={assetUserOptions}
              disabled={assetUsersQuery.isLoading || assetUsersQuery.isError}
            >
              {dialogState?.type === "asset" &&
              dialogState.mode === "edit" &&
              dialogState.asset?.user_id &&
              !hasAssignableUser(dialogState.asset.user_id, assetUsersQuery.data) ? (
                <option value={dialogState.asset.user_id}>
                  {getLegacySelectedUserLabel(dialogState.asset, "user")}
                </option>
              ) : null}
            </TiNativeSelect>
            <TiNativeSelect
              label="Responsável TI"
              name="responsible_it_staff_id"
              defaultValue={
                dialogState?.type === "asset"
                  ? getText(dialogState.asset?.responsible_it_staff_id, "")
                  : ""
              }
              options={technologyResponsibleOptions}
              disabled={
                technologyResponsibleUsersQuery.isLoading || technologyResponsibleUsersQuery.isError
              }
            >
              {dialogState?.type === "asset" &&
              dialogState.mode === "edit" &&
              dialogState.asset?.responsible_it_staff_id &&
              !hasAssignableUser(
                dialogState.asset.responsible_it_staff_id,
                technologyResponsibleUsersQuery.data,
              ) ? (
                <option value={dialogState.asset.responsible_it_staff_id}>
                  {getLegacySelectedUserLabel(dialogState.asset, "responsible_it_staff")}
                </option>
              ) : null}
            </TiNativeSelect>
          </div>
          <TiTextarea
            label="Notas"
            name="notes"
            defaultValue={dialogState?.type === "asset" ? getText(dialogState.asset?.notes, "") : ""}
          />
          <div className="flex justify-end gap-2">
            <button type="button" className="h-10 px-4 text-sm font-semibold" onClick={closeDialog}>
              Cancelar
            </button>
            <TiIconAction
              icon={Plus}
              type="submit"
              label={isAssetSubmitting ? "Salvando..." : "Salvar ativo"}
              variant="primary"
              disabled={isAssetSubmitting || !canManage}
            />
          </div>
        </form>
      </Dialog>

      <Dialog
        open={dialogState?.type === "assign"}
        onOpenChange={(open) => {
          if (!open) {
            closeDialog();
          }
        }}
        title="Atribuir usuário"
        description="Atribuição de responsável pelo ativo."
      >
        <form className="space-y-4" onSubmit={handleSubmitAssign}>
          {dialogError ? <TiInlineNotice tone="danger">{dialogError}</TiInlineNotice> : null}
          <TiInlineNotice tone="warning">
            A atribuição será registrada no ativo selecionado após a confirmação.
          </TiInlineNotice>
          <TiNativeSelect
            label="Usuário"
            name="user_id"
            required
            options={assetUserOptions}
            disabled={assetUsersQuery.isLoading || assetUsersQuery.isError}
          />
          <div className="flex justify-end gap-2">
            <button type="button" className="h-10 px-4 text-sm font-semibold" onClick={closeDialog}>
              Cancelar
            </button>
            <TiIconAction
              icon={UserPlus}
              type="submit"
              label={assignUserMutation.isPending ? "Atribuindo..." : "Atribuir usuário"}
              variant="primary"
              disabled={assignUserMutation.isPending || !canManage}
            />
          </div>
        </form>
      </Dialog>

      <Dialog
        open={dialogState?.type === "return"}
        onOpenChange={(open) => {
          if (!open) {
            closeDialog();
          }
        }}
        title="Registrar devolução"
        description="Registro de devolução do ativo."
      >
        <form className="space-y-4" onSubmit={handleSubmitReturn}>
          {dialogError ? <TiInlineNotice tone="danger">{dialogError}</TiInlineNotice> : null}
          <TiInlineNotice tone="warning">
            A devolução será registrada no ativo selecionado após a confirmação.
          </TiInlineNotice>
          <TiTextarea label="Observação" name="notes" />
          <div className="flex justify-end gap-2">
            <button type="button" className="h-10 px-4 text-sm font-semibold" onClick={closeDialog}>
              Cancelar
            </button>
            <TiIconAction
              icon={RotateCcw}
              type="submit"
              label={returnAssetMutation.isPending ? "Registrando..." : "Registrar devolução"}
              variant="primary"
              disabled={returnAssetMutation.isPending || !canManage}
            />
          </div>
        </form>
      </Dialog>

      <Dialog
        open={dialogState?.type === "categories"}
        onOpenChange={(open) => {
          if (!open) {
            closeDialog();
          }
        }}
        title="Categorias"
        description="Gestão de categorias de inventário."
        contentClassName="w-[min(92vw,1040px)]"
      >
        <div className="space-y-4">
          {dialogError ? <TiInlineNotice tone="danger">{dialogError}</TiInlineNotice> : null}
          <section className={tiDialogSubsectionClassName}>
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 space-y-1">
                <h3 className="text-base font-semibold text-slate-950 dark:text-white">
                  {editingCategory ? "Editar categoria" : "Adicionar categoria"}
                </h3>
                <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
                  Categorias ativas ficam disponíveis no cadastro dos ativos.
                </p>
              </div>
            </div>
            <form
              className={cn(
                "grid gap-3",
                editingCategory
                  ? "lg:grid-cols-[minmax(220px,1fr)_minmax(320px,1.45fr)_minmax(140px,160px)_auto]"
                  : "lg:grid-cols-[minmax(220px,1fr)_minmax(320px,1.45fr)_auto]",
              )}
              onSubmit={handleSubmitCategory}
            >
              <TiTextField
                key={editingCategory ? `category-name-${editingCategory.id}` : "category-name-new"}
                label="Nome"
                name="name"
                required
                defaultValue={getText(editingCategory?.name, "")}
              />
              <TiTextField
                key={
                  editingCategory
                    ? `category-description-${editingCategory.id}`
                    : "category-description-new"
                }
                label="Descrição"
                name="tag"
                defaultValue={getText(editingCategory?.description ?? editingCategory?.tag, "")}
              />
              {editingCategory ? (
                <TiNativeSelect
                  key={`category-status-${editingCategory.id}`}
                  label="Status"
                  name="active"
                  defaultValue={normalizeStatus(getCatalogStatus(editingCategory) ?? "active")}
                  options={ACTIVE_STATUS_OPTIONS}
                />
              ) : null}
              <div className="flex flex-wrap items-end justify-end gap-2 lg:flex-nowrap lg:self-end">
                <button
                  type="submit"
                  className={cn(tiPrimaryButtonClassName, tiCompactButtonClassName)}
                  disabled={isCategorySubmitting || !canManage}
                >
                  {editingCategory ? <Save className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                  <span>
                    {isCategorySubmitting
                      ? "Salvando..."
                      : editingCategory
                        ? "Salvar"
                        : "Criar"}
                  </span>
                </button>
                {editingCategory ? (
                  <button
                    type="button"
                    className={cn(tiSecondaryButtonClassName, tiCompactButtonClassName)}
                    onClick={() => {
                      setDialogError(null);
                      setEditingCategory(null);
                    }}
                    disabled={isCategorySubmitting}
                  >
                    <X className="h-3.5 w-3.5" />
                    <span>Cancelar</span>
                  </button>
                ) : null}
              </div>
            </form>
          </section>
          <TiQueryStatePanel
            query={categoriesQuery}
            emptyState={
              <TiEmptyState
                icon={Tags}
                title="Nenhuma categoria encontrada"
                description="Cadastre categorias para classificar os ativos."
              />
            }
          >
            {(categories) => (
              <TiDataTable headers={["Categoria", "Descrição", "Status", ""]}>
                {categories.map((category) => {
                  const isEditingCategory = String(editingCategory?.id) === String(category.id);

                  return (
                    <tr key={category.id} className="text-slate-700 dark:text-slate-200">
                      <td className="px-4 py-3 font-semibold">
                        {getText(category.name, "Categoria sem nome")}
                      </td>
                      <td className="px-4 py-3">{getText(category.description ?? category.tag)}</td>
                      <td className="px-4 py-3">
                        <StatusBadge
                          config={getStatusBadgeConfig(getCatalogStatus(category))}
                          className={tiStatusBadgeClassName}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end">
                          {isEditingCategory ? (
                            <StatusBadge
                              config={{ label: "Em edição", variant: "info" }}
                              className={tiStatusBadgeClassName}
                            />
                          ) : (
                            <TiTableAction
                              icon={Pencil}
                              label="Editar"
                              disabled={!canManage}
                              onClick={() => startEditingCategory(category)}
                            />
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </TiDataTable>
            )}
          </TiQueryStatePanel>
        </div>
      </Dialog>
    </TiPanel>
  );
}
