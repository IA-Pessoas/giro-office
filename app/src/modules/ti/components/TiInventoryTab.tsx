import { useMemo, useState, type FormEvent } from "react";
import { Boxes, Eye, MapPin, Pencil, Plus, RotateCcw, Tags, UserPlus } from "lucide-react";

import { useModuleAccess } from "@modules/auth";
import { Dialog } from "@shared/components/ui/Dialog";
import { cn } from "@shared/ui/newLayout/utils";

import {
  useAssignTiInventoryAssetUserMutation,
  useCreateTiInventoryAssetMutation,
  useCreateTiInventoryCategoryMutation,
  useCreateTiInventoryLocationMutation,
  useReturnTiInventoryAssetMutation,
  useTiInventory,
  useTiInventoryAsset,
  useTiInventoryCategories,
  useTiInventoryLocations,
  useUpdateTiInventoryAssetMutation,
  useUpdateTiInventoryCategoryMutation,
  useUpdateTiInventoryLocationMutation,
} from "../hooks";
import type {
  TiId,
  TiInventoryAsset,
  TiInventoryCategory,
  TiInventoryLocation,
} from "../types";
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

type InventoryDialogState =
  | { type: "asset"; mode: "create"; asset?: undefined }
  | { type: "asset"; mode: "edit"; asset: TiInventoryAsset }
  | { type: "assign"; asset: TiInventoryAsset }
  | { type: "return"; asset: TiInventoryAsset }
  | { type: "categories" }
  | { type: "locations" };

const INVENTORY_STATUS_OPTIONS = [
  { value: "", label: "Todos" },
  { value: "available", label: "Disponível" },
  { value: "assigned", label: "Atribuído" },
  { value: "maintenance", label: "Manutenção" },
  { value: "retired", label: "Baixado" },
];

const ASSET_FORM_STATUS_OPTIONS = INVENTORY_STATUS_OPTIONS.filter((option) => option.value);

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

function getStatusTone(status: unknown): "neutral" | "success" | "warning" | "danger" | "info" {
  const normalized = normalizeStatus(status);

  if (normalized === "available" || normalized === "active") {
    return "success";
  }

  if (normalized === "assigned") {
    return "info";
  }

  if (normalized === "maintenance") {
    return "warning";
  }

  if (normalized === "retired" || normalized === "inactive") {
    return "neutral";
  }

  return "neutral";
}

function getCatalogStatus(
  item?: { status?: unknown; is_active?: boolean | null } | null,
): unknown {
  if (!item) {
    return undefined;
  }

  return item.status ?? item.is_active;
}

function getAssetTitle(asset: TiInventoryAsset): string {
  return getText(asset.name ?? asset.code ?? asset.patrimony_code, "Ativo sem nome");
}

function getAssetCode(asset: TiInventoryAsset): string {
  return getText(asset.code ?? asset.patrimony_code ?? asset.serial_number);
}

function getAssignedUser(asset: TiInventoryAsset): string {
  return getText(
    asset.assigned_user_name ?? asset.assigned_to_user_name ?? asset.assigned_user_id ?? asset.assigned_to_user_id,
  );
}

function getMutationErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Não foi possível concluir a ação.";
}

export function TiInventoryTab() {
  const { access } = useModuleAccess("ti");
  const canManage = access.canEdit || access.isAdmin;
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [selectedAssetId, setSelectedAssetId] = useState<TiId | undefined>();
  const [dialogState, setDialogState] = useState<InventoryDialogState | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [editingCategory, setEditingCategory] = useState<TiInventoryCategory | null>(null);
  const [editingLocation, setEditingLocation] = useState<TiInventoryLocation | null>(null);

  const filters = useMemo(
    () =>
      compactPayload({
        search,
        status,
        category_id: categoryId,
        location_id: locationId,
      }),
    [categoryId, locationId, search, status],
  );

  const inventoryQuery = useTiInventory(filters);
  const categoriesQuery = useTiInventoryCategories();
  const locationsQuery = useTiInventoryLocations();
  const selectedAssetQuery = useTiInventoryAsset(selectedAssetId, { enabled: Boolean(selectedAssetId) });

  const createAssetMutation = useCreateTiInventoryAssetMutation();
  const updateAssetMutation = useUpdateTiInventoryAssetMutation();
  const assignUserMutation = useAssignTiInventoryAssetUserMutation();
  const returnAssetMutation = useReturnTiInventoryAssetMutation();
  const createCategoryMutation = useCreateTiInventoryCategoryMutation();
  const updateCategoryMutation = useUpdateTiInventoryCategoryMutation();
  const createLocationMutation = useCreateTiInventoryLocationMutation();
  const updateLocationMutation = useUpdateTiInventoryLocationMutation();

  const categoriesById = useMemo(
    () => new Map((categoriesQuery.data ?? []).map((category) => [String(category.id), category])),
    [categoriesQuery.data],
  );

  const locationsById = useMemo(
    () => new Map((locationsQuery.data ?? []).map((location) => [String(location.id), location])),
    [locationsQuery.data],
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

  const locationOptions = useMemo(
    () => [
      { value: "", label: "Todos" },
      ...(locationsQuery.data ?? []).map((location) => ({
        value: String(location.id),
        label: getText(location.name, "Local sem nome"),
      })),
    ],
    [locationsQuery.data],
  );

  const selectedListAsset = (inventoryQuery.data ?? []).find(
    (asset) => String(asset.id) === String(selectedAssetId),
  );
  const selectedAsset = selectedAssetQuery.data ?? selectedListAsset;

  function getCategoryName(id: unknown): string {
    return getText(categoriesById.get(String(id))?.name);
  }

  function getLocationName(id: unknown): string {
    return getText(locationsById.get(String(id))?.name);
  }

  function closeDialog() {
    setDialogState(null);
    setDialogError(null);
    setEditingCategory(null);
    setEditingLocation(null);
  }

  function openDialog(nextDialogState: InventoryDialogState) {
    setDialogError(null);
    setDialogState(nextDialogState);
  }

  async function handleSubmitAsset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canManage || dialogState?.type !== "asset") {
      return;
    }

    const formData = new FormData(event.currentTarget);
    const payload = compactPayload({
      name: getFormText(formData, "name"),
      code: getFormText(formData, "code"),
      serial_number: getFormText(formData, "serial_number"),
      brand: getFormText(formData, "brand"),
      model: getFormText(formData, "model"),
      category_id: getFormText(formData, "category_id"),
      location_id: getFormText(formData, "location_id"),
      status: getFormText(formData, "status"),
      notes: getFormText(formData, "notes"),
    });

    try {
      setDialogError(null);

      if (dialogState.mode === "edit") {
        await updateAssetMutation.mutateAsync({ id: dialogState.asset.id, payload });
      } else {
        const createdAsset = await createAssetMutation.mutateAsync(payload);
        setSelectedAssetId(createdAsset.id);
      }

      closeDialog();
    } catch (error) {
      setDialogError(getMutationErrorMessage(error));
    }
  }

  async function handleSubmitAssign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canManage || dialogState?.type !== "assign") {
      return;
    }

    const formData = new FormData(event.currentTarget);
    const userId = getFormText(formData, "assigned_user_id");

    if (!confirm("Confirmar atribuição deste ativo?")) {
      return;
    }

    try {
      setDialogError(null);
      await assignUserMutation.mutateAsync({
        id: dialogState.asset.id,
        payload: compactPayload({
          assigned_user_id: userId,
          assigned_to_user_id: userId,
          notes: getFormText(formData, "notes"),
        }),
      });
      setSelectedAssetId(dialogState.asset.id);
      closeDialog();
    } catch (error) {
      setDialogError(getMutationErrorMessage(error));
    }
  }

  async function handleSubmitReturn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canManage || dialogState?.type !== "return") {
      return;
    }

    if (!confirm("Confirmar devolução deste ativo?")) {
      return;
    }

    const formData = new FormData(event.currentTarget);

    try {
      setDialogError(null);
      await returnAssetMutation.mutateAsync({
        id: dialogState.asset.id,
        payload: compactPayload({
          notes: getFormText(formData, "notes"),
        }),
      });
      setSelectedAssetId(dialogState.asset.id);
      closeDialog();
    } catch (error) {
      setDialogError(getMutationErrorMessage(error));
    }
  }

  async function handleSubmitCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canManage) {
      return;
    }

    const categoryForm = event.currentTarget;
    const formData = new FormData(categoryForm);
    const activeStatus = getFormText(formData, "status");
    const payload = compactPayload({
      name: getFormText(formData, "name"),
      description: getFormText(formData, "description"),
      status: activeStatus,
      is_active: activeStatus ? activeStatus === "active" : undefined,
    });

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
      setDialogError(getMutationErrorMessage(error));
    }
  }

  async function handleSubmitLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canManage) {
      return;
    }

    const locationForm = event.currentTarget;
    const formData = new FormData(locationForm);
    const activeStatus = getFormText(formData, "status");
    const payload = compactPayload({
      name: getFormText(formData, "name"),
      description: getFormText(formData, "description"),
      status: activeStatus,
      is_active: activeStatus ? activeStatus === "active" : undefined,
    });

    try {
      setDialogError(null);

      if (editingLocation) {
        await updateLocationMutation.mutateAsync({ id: editingLocation.id, payload });
      } else {
        await createLocationMutation.mutateAsync(payload);
      }

      setEditingLocation(null);
      locationForm.reset();
    } catch (error) {
      setDialogError(getMutationErrorMessage(error));
    }
  }

  const isAssetSubmitting = createAssetMutation.isPending || updateAssetMutation.isPending;
  const isCategorySubmitting =
    createCategoryMutation.isPending || updateCategoryMutation.isPending;
  const isLocationSubmitting =
    createLocationMutation.isPending || updateLocationMutation.isPending;

  return (
    <TiPanel className="space-y-5">
      <TiSectionHeader
        title="Inventário"
        description="Controle ativos, categorias, locais, usuários responsáveis e devoluções."
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
              <TiIconAction
                icon={MapPin}
                label="Locais"
                onClick={() => openDialog({ type: "locations" })}
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
          placeholder="Nome, código ou serial"
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
          label="Local"
          value={locationId}
          onChange={(event) => setLocationId(event.target.value)}
          options={locationOptions}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.75fr)]">
        <TiQueryStatePanel
          query={inventoryQuery}
          emptyState={
            <TiEmptyState
              icon={Boxes}
              title="Nenhum ativo encontrado"
              description="Os equipamentos e demais ativos de Tecnologia aparecem aqui depois do cadastro."
              action={
                canManage ? (
                  <TiIconAction
                    icon={Plus}
                    label="Novo ativo"
                    variant="primary"
                    onClick={() => openDialog({ type: "asset", mode: "create" })}
                  />
                ) : null
              }
            />
          }
        >
          {(assets) => (
            <TiDataTable headers={["Ativo", "Categoria", "Local", "Responsável", "Status", ""]}>
              {assets.map((asset) => {
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
                        onClick={() => setSelectedAssetId(asset.id)}
                      >
                        {getAssetTitle(asset)}
                      </button>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {getAssetCode(asset)}
                      </p>
                    </td>
                    <td className="px-4 py-3">{getCategoryName(asset.category_id)}</td>
                    <td className="px-4 py-3">{getLocationName(asset.location_id)}</td>
                    <td className="px-4 py-3">{getAssignedUser(asset)}</td>
                    <td className="px-4 py-3">
                      <TiStatusPill tone={getStatusTone(asset.status)}>
                        {formatStatus(asset.status)}
                      </TiStatusPill>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <TiTableAction
                          icon={Eye}
                          label="Detalhes"
                          onClick={() => setSelectedAssetId(asset.id)}
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
          )}
        </TiQueryStatePanel>

        <TiDetailPanel title="Detalhe do ativo">
          {selectedAssetQuery.isLoading ? (
            <TiFieldLine label="Status" value="Carregando..." />
          ) : selectedAssetQuery.isError ? (
            <TiInlineNotice tone="danger">
              {selectedAssetQuery.error?.message ?? "Não foi possível carregar o detalhe."}
            </TiInlineNotice>
          ) : selectedAsset ? (
            <>
              <TiFieldLine label="Ativo" value={getAssetTitle(selectedAsset)} />
              <TiFieldLine label="Código" value={getAssetCode(selectedAsset)} />
              <TiFieldLine label="Categoria" value={getCategoryName(selectedAsset.category_id)} />
              <TiFieldLine label="Local" value={getLocationName(selectedAsset.location_id)} />
              <TiFieldLine label="Responsável" value={getAssignedUser(selectedAsset)} />
              <TiFieldLine
                label="Status"
                value={
                  <TiStatusPill tone={getStatusTone(selectedAsset.status)}>
                    {formatStatus(selectedAsset.status)}
                  </TiStatusPill>
                }
              />
              <TiFieldLine label="Marca" value={getText(selectedAsset.brand)} />
              <TiFieldLine label="Modelo" value={getText(selectedAsset.model)} />
              <TiFieldLine label="Notas" value={getText(selectedAsset.notes)} />
            </>
          ) : (
            <div className="flex min-h-32 items-center justify-center text-center text-sm font-medium text-slate-500 dark:text-slate-400">
              Selecione um ativo para ver os detalhes.
            </div>
          )}
        </TiDetailPanel>
      </div>

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
              label="Nome"
              name="name"
              required
              defaultValue={dialogState?.type === "asset" ? dialogState.asset?.name ?? "" : ""}
            />
            <TiTextField
              label="Código"
              name="code"
              defaultValue={dialogState?.type === "asset" ? getText(dialogState.asset?.code, "") : ""}
            />
            <TiTextField
              label="Serial"
              name="serial_number"
              defaultValue={
                dialogState?.type === "asset" ? getText(dialogState.asset?.serial_number, "") : ""
              }
            />
            <TiNativeSelect
              label="Status"
              name="status"
              defaultValue={
                dialogState?.type === "asset"
                  ? normalizeStatus(dialogState.asset?.status || "available")
                  : "available"
              }
              options={ASSET_FORM_STATUS_OPTIONS}
            />
            <TiNativeSelect
              label="Categoria"
              name="category_id"
              defaultValue={
                dialogState?.type === "asset" ? getText(dialogState.asset?.category_id, "") : ""
              }
              options={categoryOptions}
            />
            <TiNativeSelect
              label="Local"
              name="location_id"
              defaultValue={
                dialogState?.type === "asset" ? getText(dialogState.asset?.location_id, "") : ""
              }
              options={locationOptions}
            />
            <TiTextField
              label="Marca"
              name="brand"
              defaultValue={dialogState?.type === "asset" ? getText(dialogState.asset?.brand, "") : ""}
            />
            <TiTextField
              label="Modelo"
              name="model"
              defaultValue={dialogState?.type === "asset" ? getText(dialogState.asset?.model, "") : ""}
            />
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
          <TiTextField label="ID do usuário" name="assigned_user_id" required />
          <TiTextarea label="Observação" name="notes" />
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
        contentClassName="w-[min(92vw,860px)]"
      >
        <div className="space-y-4">
          {dialogError ? <TiInlineNotice tone="danger">{dialogError}</TiInlineNotice> : null}
          <form className="grid gap-3 md:grid-cols-[1fr_1fr_140px_auto]" onSubmit={handleSubmitCategory}>
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
              name="description"
              defaultValue={getText(editingCategory?.description, "")}
            />
            <TiNativeSelect
              key={editingCategory ? `category-status-${editingCategory.id}` : "category-status-new"}
              label="Status"
              name="status"
              defaultValue={normalizeStatus(getCatalogStatus(editingCategory) ?? "active")}
              options={ACTIVE_STATUS_OPTIONS}
            />
            <div className="flex items-end gap-2">
              <TiIconAction
                icon={Plus}
                type="submit"
                label={isCategorySubmitting ? "Salvando..." : "Salvar"}
                variant="primary"
                disabled={isCategorySubmitting || !canManage}
              />
            </div>
          </form>
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
                {categories.map((category) => (
                  <tr key={category.id} className="text-slate-700 dark:text-slate-200">
                    <td className="px-4 py-3 font-semibold">
                      {getText(category.name, "Categoria sem nome")}
                    </td>
                    <td className="px-4 py-3">{getText(category.description)}</td>
                    <td className="px-4 py-3">
                      <TiStatusPill tone={getStatusTone(getCatalogStatus(category))}>
                        {formatStatus(getCatalogStatus(category))}
                      </TiStatusPill>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end">
                        <TiTableAction
                          icon={Pencil}
                          label="Editar"
                          disabled={!canManage}
                          onClick={() => setEditingCategory(category)}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </TiDataTable>
            )}
          </TiQueryStatePanel>
        </div>
      </Dialog>

      <Dialog
        open={dialogState?.type === "locations"}
        onOpenChange={(open) => {
          if (!open) {
            closeDialog();
          }
        }}
        title="Locais"
        description="Gestão de locais de inventário."
        contentClassName="w-[min(92vw,860px)]"
      >
        <div className="space-y-4">
          {dialogError ? <TiInlineNotice tone="danger">{dialogError}</TiInlineNotice> : null}
          <form className="grid gap-3 md:grid-cols-[1fr_1fr_140px_auto]" onSubmit={handleSubmitLocation}>
            <TiTextField
              key={editingLocation ? `location-name-${editingLocation.id}` : "location-name-new"}
              label="Nome"
              name="name"
              required
              defaultValue={getText(editingLocation?.name, "")}
            />
            <TiTextField
              key={
                editingLocation
                  ? `location-description-${editingLocation.id}`
                  : "location-description-new"
              }
              label="Descrição"
              name="description"
              defaultValue={getText(editingLocation?.description, "")}
            />
            <TiNativeSelect
              key={editingLocation ? `location-status-${editingLocation.id}` : "location-status-new"}
              label="Status"
              name="status"
              defaultValue={normalizeStatus(getCatalogStatus(editingLocation) ?? "active")}
              options={ACTIVE_STATUS_OPTIONS}
            />
            <div className="flex items-end gap-2">
              <TiIconAction
                icon={Plus}
                type="submit"
                label={isLocationSubmitting ? "Salvando..." : "Salvar"}
                variant="primary"
                disabled={isLocationSubmitting || !canManage}
              />
            </div>
          </form>
          <TiQueryStatePanel
            query={locationsQuery}
            emptyState={
              <TiEmptyState
                icon={MapPin}
                title="Nenhum local encontrado"
                description="Cadastre locais para organizar os ativos."
              />
            }
          >
            {(locations) => (
              <TiDataTable headers={["Local", "Descrição", "Status", ""]}>
                {locations.map((location) => (
                  <tr key={location.id} className="text-slate-700 dark:text-slate-200">
                    <td className="px-4 py-3 font-semibold">
                      {getText(location.name, "Local sem nome")}
                    </td>
                    <td className="px-4 py-3">{getText(location.description)}</td>
                    <td className="px-4 py-3">
                      <TiStatusPill tone={getStatusTone(getCatalogStatus(location))}>
                        {formatStatus(getCatalogStatus(location))}
                      </TiStatusPill>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end">
                        <TiTableAction
                          icon={Pencil}
                          label="Editar"
                          disabled={!canManage}
                          onClick={() => setEditingLocation(location)}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </TiDataTable>
            )}
          </TiQueryStatePanel>
        </div>
      </Dialog>
    </TiPanel>
  );
}
