import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Layers3,
  Loader2,
  LogIn,
  LogOut,
  MapPin,
  PackageCheck,
  PackageSearch,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Tags,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { toast } from "@shared/services/toast";

import { useModuleAccess } from "@modules/auth";
import { useAssignableUsers } from "@modules/rh";
import { ConfirmationDialog, PaginationControls } from "@shared/components";
import { Dialog } from "@shared/components/ui/Dialog";
import { StatusBadge, type StatusBadgeConfig } from "@shared/components/StatusBadge";
import { DEFAULT_PAGE_SIZE } from "@shared/pagination/pagination";
import { cn } from "@shared/ui/newLayout/utils";

import {
  useCreateTiStockCategoryMutation,
  useCreateTiStockEntryMutation,
  useCreateTiStockExitMutation,
  useCreateTiStockItemMutation,
  useCreateTiStockLocationMutation,
  useTiStockCategories,
  useTiStockItem,
  useTiStockItemMovements,
  useTiStockItems,
  useTiStockLocations,
  useUpdateTiStockItemMutation,
} from "../hooks";
import type {
  TiId,
  TiListFilters,
  TiStockCategory,
  TiStockExitPayload,
  TiStockItem,
  TiStockItemCreatePayload,
  TiStockItemUpdatePayload,
  TiStockLocation,
  TiStockMovement,
} from "../types";
import {
  filterTiStockLocations,
  hasActiveTiStockLocation,
  resolveTiStockLocationName,
} from "../utils/stockDisplay";
import { getTiStockMutationErrorMessage } from "../utils/stockMutationError";
import { TiNativeSelect } from "./TiNativeSelect";
import { TiStockItemSelect } from "./TiStockItemSelect";
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
  TiTextField,
  TiTextarea,
} from "./tiFormControls";
import {
  tiCardClassName,
  tiDialogSubsectionClassName,
  tiFiveRowTableClassName,
  tiSecondaryButtonClassName,
} from "./tiWorkspaceUi";

type StockItemFormState = {
  name: string;
  category_id: string;
  location_id: string;
  quantity: string;
  description: string;
  status: string;
};

type StockExitFormState = {
  quantity: string;
  requester_id: string;
  destination: string;
  approver_id: string;
  operator_id: string;
  location_destination_id: string;
};

type PendingExitConfirmation = {
  id: TiId;
  payload: TiStockExitPayload;
};

type StockDialogState = "item" | "entry" | "exit" | "categories" | "locations" | null;

type StockFilterDraft = {
  name: string;
  category_id: string;
  location_id: string;
  status: string;
};

const initialItemFormState: StockItemFormState = {
  name: "",
  category_id: "",
  location_id: "",
  quantity: "0",
  description: "",
  status: "true",
};

const initialExitFormState: StockExitFormState = {
  quantity: "",
  requester_id: "",
  destination: "",
  approver_id: "",
  operator_id: "",
  location_destination_id: "",
};

const initialStockFilterDraft: StockFilterDraft = {
  name: "",
  category_id: "",
  location_id: "",
  status: "",
};

const STOCK_STATUS_FILTER_OPTIONS = [
  { value: "", label: "Todos" },
  { value: "true", label: "Ativos" },
  { value: "false", label: "Inativos" },
] as const;

const STOCK_PAGE_SIZE = DEFAULT_PAGE_SIZE;

function formatText(value: unknown, fallback = "-"): string {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  return String(value);
}

function formatQuantity(value: unknown): string {
  if (typeof value === "number") {
    return new Intl.NumberFormat("pt-BR").format(value);
  }

  return formatText(value);
}

function formatDateTime(value: unknown): string {
  const date = typeof value === "string" || value instanceof Date ? new Date(value) : null;

  if (!date || Number.isNaN(date.getTime())) {
    return formatText(value);
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function getMovementActor(movement: TiStockMovement): string {
  return formatText(
    movement.type === "entry" ? movement.operator_name : movement.requester_name,
    "Responsável não informado",
  );
}

function formatStatus(value: unknown): StatusBadgeConfig {
  if (typeof value === "boolean") {
    return {
      label: value ? "Ativo" : "Inativo",
      variant: value ? "success" : "neutral",
      icon: value ? CheckCircle2 : XCircle,
    };
  }

  const normalized = String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

  if (!normalized || normalized === "active" || normalized === "ativo") {
    return { label: "Ativo", variant: "success", icon: CheckCircle2 };
  }

  if (normalized === "inactive" || normalized === "inativo" || normalized === "false") {
    return { label: "Inativo", variant: "neutral", icon: XCircle };
  }

  return { label: formatText(value, "Sem status"), variant: "info" };
}

function toPositiveNumber(value: string): number | null {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return Math.trunc(parsed);
}

function toNonNegativeNumber(value: string): number | null {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return Math.trunc(parsed);
}

function toOptionalText(value: string): string | undefined {
  const trimmed = value.trim();

  return trimmed || undefined;
}

function normalizeStockCategoryName(value: unknown): string {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function toOptionalId(value: string): TiId | undefined {
  const trimmed = value.trim();

  return trimmed || undefined;
}

function toOptionalFloor(value: string): number | undefined {
  if (!value.trim()) {
    return undefined;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? Math.trunc(parsed) : undefined;
}

function getId(value: TiId | null | undefined): string {
  return value === null || value === undefined ? "" : String(value);
}

function getRelatedName(
  relation: { name?: string | null } | null | undefined,
  fallbackId?: TiId | null,
): string {
  return formatText(relation?.name ?? fallbackId, "-");
}

function getMutationErrorMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : "";

  if (/403|forbidden|permission|permiss/i.test(message)) {
    return "Acesso negado para executar esta ação.";
  }

  if (/409|conflict|saldo|insuficiente/i.test(message)) {
    return message || "Não foi possível concluir por conflito de dados.";
  }

  return message || fallback;
}

function buildItemFormState(item?: TiStockItem | null): StockItemFormState {
  if (!item) {
    return initialItemFormState;
  }

  return {
    name: formatText(item.name, ""),
    category_id: getId(item.category_id),
    location_id: getId(item.location_id),
    quantity: String(item.quantity ?? 0),
    description: formatText(item.description, ""),
    status: item.status === false ? "false" : "true",
  };
}

export function TiStockTab() {
  const { access } = useModuleAccess("ti");
  const canEditStock = access.canEdit || access.isAdmin;
  const [filters, setFilters] = useState<TiListFilters>({});
  const [stockPage, setStockPage] = useState(1);
  const [stockFilterDraft, setStockFilterDraft] =
    useState<StockFilterDraft>(initialStockFilterDraft);
  const [selectedItemId, setSelectedItemId] = useState<TiId | undefined>();
  const [isStockDetailDialogOpen, setIsStockDetailDialogOpen] = useState(false);
  const [itemForm, setItemForm] = useState<StockItemFormState>(initialItemFormState);
  const [editingItemId, setEditingItemId] = useState<TiId | undefined>();
  const [stockDialog, setStockDialog] = useState<StockDialogState>(null);
  const [movementItem, setMovementItem] = useState<TiStockItem | null>(null);
  const [entryQuantity, setEntryQuantity] = useState("");
  const [exitForm, setExitForm] = useState<StockExitFormState>(initialExitFormState);
  const [pendingExitConfirmation, setPendingExitConfirmation] =
    useState<PendingExitConfirmation | null>(null);
  const [exitConfirmationError, setExitConfirmationError] = useState<string | null>(null);
  const [categoryName, setCategoryName] = useState("");
  const [locationName, setLocationName] = useState("");
  const [locationFloor, setLocationFloor] = useState("");

  const stockListFilters = useMemo(
    () => ({
      ...filters,
      page: stockPage,
      page_size: STOCK_PAGE_SIZE,
    }),
    [filters, stockPage],
  );
  const stockItemsQuery = useTiStockItems(stockListFilters);
  const selectedItemQuery = useTiStockItem(selectedItemId, { enabled: Boolean(selectedItemId) });
  const stockMovementsQuery = useTiStockItemMovements(selectedItemId, {
    enabled: Boolean(selectedItemId && isStockDetailDialogOpen),
  });
  const stockCategoriesQuery = useTiStockCategories();
  const stockLocationsQuery = useTiStockLocations();
  const assignableUsersQuery = useAssignableUsers({ enabled: canEditStock, module: "ti" });

  const createItemMutation = useCreateTiStockItemMutation();
  const updateItemMutation = useUpdateTiStockItemMutation();
  const createEntryMutation = useCreateTiStockEntryMutation();
  const createExitMutation = useCreateTiStockExitMutation();
  const createCategoryMutation = useCreateTiStockCategoryMutation();
  const createLocationMutation = useCreateTiStockLocationMutation();

  const stockCategories = stockCategoriesQuery.data ?? [];
  const stockLocations = stockLocationsQuery.data ?? [];
  const filteredStockLocations = useMemo(
    () => filterTiStockLocations(stockLocations, locationName),
    [locationName, stockLocations],
  );
  const stockItems = stockItemsQuery.data?.data ?? [];
  const users = assignableUsersQuery.data ?? [];
  const selectedListItem = stockItems.find((item) => getId(item.id) === getId(selectedItemId));
  const selectedItem = selectedItemQuery.data ?? selectedListItem;
  const stockMovements = stockMovementsQuery.data ?? [];
  const isItemSubmitting = createItemMutation.isPending || updateItemMutation.isPending;
  const initialQuantityError =
    itemForm.quantity.trim() !== "" && toNonNegativeNumber(itemForm.quantity) === null
      ? "Informe uma quantidade maior ou igual a zero."
      : undefined;
  const isMovementSubmitting = createEntryMutation.isPending || createExitMutation.isPending;
  const isStockRefreshing =
    stockItemsQuery.isFetching ||
    selectedItemQuery.isFetching ||
    stockCategoriesQuery.isFetching ||
    stockLocationsQuery.isFetching ||
    assignableUsersQuery.isFetching;

  const normalizedCategorySearch = normalizeStockCategoryName(categoryName);
  const filteredStockCategories = useMemo(() => {
    if (!normalizedCategorySearch) {
      return stockCategories;
    }

    return stockCategories.filter((category) =>
      normalizeStockCategoryName(category.name).includes(normalizedCategorySearch),
    );
  }, [normalizedCategorySearch, stockCategories]);
  const hasExactCategoryName = stockCategories.some(
    (category) => normalizeStockCategoryName(category.name) === normalizedCategorySearch,
  );

  const categoryOptions = useMemo(
    () => [
      { value: "", label: "Selecione" },
      ...stockCategories.map((category) => ({
        value: getId(category.id),
        label: formatText(category.name, "Categoria sem nome"),
      })),
    ],
    [stockCategories],
  );

  const categoryFilterOptions = useMemo(
    () => [
      { value: "", label: "Todas" },
      ...stockCategories.map((category) => ({
        value: getId(category.id),
        label: formatText(category.name, "Categoria sem nome"),
      })),
    ],
    [stockCategories],
  );

  const locationOptions = useMemo(
    () => [
      { value: "", label: "Selecione" },
      ...stockLocations.map((location) => ({
        value: getId(location.id),
        label: formatText(location.name, "Local sem nome"),
      })),
    ],
    [stockLocations],
  );

  const locationFilterOptions = useMemo(
    () => [
      { value: "", label: "Todos" },
      ...stockLocations.map((location) => ({
        value: getId(location.id),
        label: formatText(location.name, "Local sem nome"),
      })),
    ],
    [stockLocations],
  );

  const userOptions = useMemo(
    () => [
      { value: "", label: "Selecione" },
      ...users.map((user) => ({
        value: user.id,
        label: user.departmentName ? `${user.name} - ${user.departmentName}` : user.name,
      })),
    ],
    [users],
  );

  useEffect(() => {
    if (editingItemId && selectedItem && getId(selectedItem.id) === getId(editingItemId)) {
      setItemForm(buildItemFormState(selectedItem));
    }
  }, [editingItemId, selectedItem]);

  function updateItemField<Key extends keyof StockItemFormState>(
    field: Key,
    value: StockItemFormState[Key],
  ) {
    setItemForm((current) => ({ ...current, [field]: value }));
  }

  function updateExitField<Key extends keyof StockExitFormState>(
    field: Key,
    value: StockExitFormState[Key],
  ) {
    setExitForm((current) => ({ ...current, [field]: value }));
  }

  function updateStockFilterField<Key extends keyof StockFilterDraft>(
    field: Key,
    value: StockFilterDraft[Key],
  ) {
    setStockFilterDraft((current) => ({ ...current, [field]: value }));
  }

  function handleSelectItem(item: TiStockItem) {
    setSelectedItemId(item.id);
    setEditingItemId(undefined);
    setItemForm(initialItemFormState);
    setEntryQuantity("");
    setExitForm(initialExitFormState);
  }

  function openStockDetail(item: TiStockItem) {
    handleSelectItem(item);
    setIsStockDetailDialogOpen(true);
  }

  function handleEditItem(item: TiStockItem) {
    setSelectedItemId(item.id);
    setEditingItemId(item.id);
    setItemForm(buildItemFormState(item));
    setStockDialog("item");
  }

  function resetItemForm() {
    setEditingItemId(undefined);
    setItemForm(initialItemFormState);
  }

  function openCreateItemDialog() {
    resetItemForm();
    setStockDialog("item");
  }

  function closeItemDialog() {
    resetItemForm();
    setStockDialog(null);
  }

  function openMovementDialog(nextDialog: "entry" | "exit") {
    setMovementItem(selectedItem ?? null);
    setStockDialog(nextDialog);
  }

  function closeEntryDialog() {
    setMovementItem(null);
    setEntryQuantity("");
    setStockDialog(null);
  }

  function closeExitDialog() {
    setMovementItem(null);
    setExitForm(initialExitFormState);
    setStockDialog(null);
  }

  function closeCategoryDialog() {
    setCategoryName("");
    setStockDialog(null);
  }

  function closeLocationDialog() {
    setLocationName("");
    setLocationFloor("");
    setStockDialog(null);
  }

  function refreshStockWorkspace() {
    void stockItemsQuery.refetch();
    void stockCategoriesQuery.refetch();
    void stockLocationsQuery.refetch();

    if (selectedItemId) {
      void selectedItemQuery.refetch();

      if (isStockDetailDialogOpen) {
        void stockMovementsQuery.refetch();
      }
    }

    if (canEditStock) {
      void assignableUsersQuery.refetch();
    }
  }

  function buildItemPayload(): TiStockItemCreatePayload | TiStockItemUpdatePayload | null {
    const name = itemForm.name.trim();

    if (!name) {
      toast.error("Informe o nome do item.");
      return null;
    }

    if (!itemForm.category_id) {
      toast.error("Selecione uma categoria.");
      return null;
    }

    if (!itemForm.location_id) {
      toast.error("Selecione um local.");
      return null;
    }

    const description = toOptionalText(itemForm.description);

    if (editingItemId) {
      return {
        name,
        category_id: itemForm.category_id,
        location_id: itemForm.location_id,
        ...(description ? { description } : {}),
        status: itemForm.status === "true",
      };
    }

    const quantity = toNonNegativeNumber(itemForm.quantity);

    if (quantity === null) {
      toast.error("Informe uma quantidade inicial válida.");
      return null;
    }

    return {
      name,
      category_id: itemForm.category_id,
      location_id: itemForm.location_id,
      quantity,
      ...(description ? { description } : {}),
    };
  }

  async function handleSubmitItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canEditStock || isItemSubmitting) {
      return;
    }

    const payload = buildItemPayload();

    if (!payload) {
      return;
    }

    try {
      if (editingItemId) {
        await updateItemMutation.mutateAsync({
          id: editingItemId,
          payload: payload as TiStockItemUpdatePayload,
        });
        toast.success("Item atualizado com sucesso.");
      } else {
        const created = await createItemMutation.mutateAsync(payload as TiStockItemCreatePayload);
        setSelectedItemId(created.id);
        toast.success("Item criado com sucesso.");
      }

      resetItemForm();
      setStockDialog(null);
    } catch (error) {
      toast.error(getMutationErrorMessage(error, "Não foi possível salvar o item."));
    }
  }

  async function handleSubmitEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canEditStock || isMovementSubmitting) {
      return;
    }

    const itemId = movementItem?.id;

    if (!itemId) {
      toast.error("Selecione o item da entrada.");
      return;
    }

    const quantity = toPositiveNumber(entryQuantity);

    if (quantity === null) {
      toast.error("Informe uma quantidade de entrada válida.");
      return;
    }

    try {
      await createEntryMutation.mutateAsync({ id: itemId, payload: { quantity } });
      setSelectedItemId(itemId);
      closeEntryDialog();
      toast.success("Entrada registrada com sucesso.");
    } catch (error) {
      toast.error(getMutationErrorMessage(error, "Não foi possível registrar a entrada."));
    }
  }

  async function handleSubmitExit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canEditStock || isMovementSubmitting) {
      return;
    }

    const itemId = movementItem?.id;

    if (!itemId) {
      toast.error("Selecione o item da saída.");
      return;
    }

    const quantity = toPositiveNumber(exitForm.quantity);

    if (quantity === null) {
      toast.error("Informe uma quantidade de saída válida.");
      return;
    }

    if (!exitForm.requester_id) {
      toast.error("Selecione o solicitante da saída.");
      return;
    }

    const payload: TiStockExitPayload = {
      quantity,
      requester_id: exitForm.requester_id,
      ...(toOptionalText(exitForm.destination)
        ? { destination: toOptionalText(exitForm.destination) }
        : {}),
      ...(toOptionalId(exitForm.approver_id) ? { approver_id: exitForm.approver_id } : {}),
      ...(toOptionalId(exitForm.operator_id) ? { operator_id: exitForm.operator_id } : {}),
      ...(toOptionalId(exitForm.location_destination_id)
        ? { location_destination_id: exitForm.location_destination_id }
        : {}),
    };

    setPendingExitConfirmation({ id: itemId, payload });
  }

  async function handleConfirmExit() {
    if (!pendingExitConfirmation) {
      return;
    }

    try {
      await createExitMutation.mutateAsync(pendingExitConfirmation);
      setSelectedItemId(pendingExitConfirmation.id);
      closeExitDialog();
      toast.success("Saída registrada com sucesso.");
    } catch (error) {
      const message = getTiStockMutationErrorMessage(error, "Não foi possível registrar a saída.");

      setExitConfirmationError(message);
      toast.error(message);
      throw error;
    }
  }

  async function handleSubmitCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canEditStock || createCategoryMutation.isPending) {
      return;
    }

    const name = categoryName.trim();

    if (!name) {
      toast.error("Informe o nome da categoria.");
      return;
    }

    try {
      await createCategoryMutation.mutateAsync({ name });
      setCategoryName("");
      void stockCategoriesQuery.refetch();
      toast.success("Categoria criada com sucesso.");
    } catch (error) {
      toast.error(getMutationErrorMessage(error, "Não foi possível criar a categoria."));
    }
  }

  async function handleSubmitLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canEditStock || createLocationMutation.isPending) {
      return;
    }

    const name = locationName.trim();

    if (!name) {
      toast.error("Informe o nome do local.");
      return;
    }

    if (hasActiveTiStockLocation(stockLocations, name)) {
      toast.error("Já existe um local de estoque de TI ativo com este nome.");
      return;
    }

    try {
      await createLocationMutation.mutateAsync({
        name,
        ...(toOptionalFloor(locationFloor) !== undefined
          ? { floor: toOptionalFloor(locationFloor) }
          : {}),
      });
      setLocationName("");
      setLocationFloor("");
      void stockLocationsQuery.refetch();
      toast.success("Local criado com sucesso.");
    } catch (error) {
      toast.error(getMutationErrorMessage(error, "Não foi possível criar o local."));
    }
  }

  function applyStockFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStockPage(1);
    setFilters({
      name: toOptionalText(stockFilterDraft.name),
      category_id: toOptionalId(stockFilterDraft.category_id),
      location_id: toOptionalId(stockFilterDraft.location_id),
      status: toOptionalText(stockFilterDraft.status),
    });
  }

  return (
    <TiPanel className="space-y-5">
      <TiSectionHeader
        title="Estoque"
        description="Controle itens, entradas, saídas, categorias, locais e níveis mínimos."
        action={
          <div className="flex flex-wrap gap-2 sm:justify-end">
            {canEditStock ? (
              <TiIconAction
                icon={Plus}
                label="Novo item"
                variant="primary"
                onClick={openCreateItemDialog}
              />
            ) : null}
            <TiIconAction
              icon={RefreshCw}
              label={isStockRefreshing ? "Atualizando..." : "Atualizar"}
              disabled={isStockRefreshing}
              onClick={refreshStockWorkspace}
            />
          </div>
        }
      />

      {!canEditStock ? (
        <TiInlineNotice tone="warning">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>Seu perfil atual permite consulta, mas não alterações de estoque.</p>
          </div>
        </TiInlineNotice>
      ) : null}

      <form
        aria-label="Filtros do estoque"
        className={`${tiCardClassName} grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(240px,1fr)_minmax(150px,180px)_minmax(150px,180px)_minmax(120px,140px)_128px]`}
        onSubmit={applyStockFilters}
      >
        <TiTextField
          label="Buscar item"
          onChange={(event) => updateStockFilterField("name", event.target.value)}
          placeholder="Nome do item"
          value={stockFilterDraft.name}
        />
        <TiNativeSelect
          disabled={stockCategoriesQuery.isLoading}
          label="Categoria"
          onChange={(event) => updateStockFilterField("category_id", event.target.value)}
          options={categoryFilterOptions}
          value={stockFilterDraft.category_id}
        />
        <TiNativeSelect
          disabled={stockLocationsQuery.isLoading}
          label="Local"
          onChange={(event) => updateStockFilterField("location_id", event.target.value)}
          options={locationFilterOptions}
          value={stockFilterDraft.location_id}
        />
        <TiNativeSelect
          label="Status"
          onChange={(event) => updateStockFilterField("status", event.target.value)}
          options={STOCK_STATUS_FILTER_OPTIONS}
          value={stockFilterDraft.status}
        />
        <div className="flex items-end md:col-span-2 xl:col-span-1">
          <button type="submit" className={cn(tiSecondaryButtonClassName, "w-full")}>
            <PackageSearch className="h-4 w-4" />
            <span>Buscar</span>
          </button>
        </div>
      </form>

      <div
        aria-label="Conteúdo do estoque"
        className={cn(
          "grid items-start gap-5",
          canEditStock ? "xl:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]" : null,
        )}
      >
        <div className="space-y-4">
          <TiQueryStatePanel
            emptyState={
              <TiEmptyState
                icon={PackageSearch}
                title="Nenhum item em estoque"
                description="Itens de Tecnologia aparecem aqui quando forem cadastrados."
              />
            }
            query={{ ...stockItemsQuery, data: stockItems }}
          >
            {(items) => (
              <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                <TiDataTable
                  className={cn(tiFiveRowTableClassName, "rounded-none border-0")}
                  headers={["Item", "Categoria", "Local", "Saldo", "Status", ""]}
                >
                  {items.map((item) => {
                    const isSelected = getId(item.id) === getId(selectedItemId);

                    return (
                      <tr
                        key={getId(item.id)}
                        className={cn(
                          "text-slate-700 dark:text-slate-200",
                          isSelected ? "bg-blue-50/60 dark:bg-blue-950/20" : null,
                        )}
                      >
                        <td className="min-w-56 max-w-sm px-4 py-2 align-top">
                          <button
                            type="button"
                            className="max-w-full break-words text-left font-semibold text-slate-900 hover:text-blue-700 dark:text-white dark:hover:text-blue-300"
                            onClick={() => openStockDetail(item)}
                          >
                            {formatText(item.name, "Item sem nome")}
                          </button>
                          {item.description ? (
                            <p className="mt-1 line-clamp-2 max-w-sm break-words text-xs text-slate-500 dark:text-slate-400">
                              {formatText(item.description)}
                            </p>
                          ) : null}
                        </td>
                        <td className="max-w-44 px-4 py-2 align-top">
                          <span className="block break-words">
                            {getRelatedName(item.category, item.category_id)}
                          </span>
                        </td>
                        <td className="max-w-44 px-4 py-2 align-top">
                          <span className="block break-words">
                            {resolveTiStockLocationName(item, stockLocations)}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-2 text-right align-top font-semibold">
                          {formatQuantity(item.quantity)}
                        </td>
                        <td className="px-4 py-2 align-top">
                          <StatusBadge config={formatStatus(item.status)} size="sm" />
                        </td>
                        <td className="px-4 py-2 align-top">
                          <div className="flex justify-end gap-1">
                            <TiTableAction
                              icon={PackageCheck}
                              label="Abrir"
                              onClick={() => openStockDetail(item)}
                            />
                            {canEditStock ? (
                              <TiTableAction
                                icon={Pencil}
                                label="Editar"
                                onClick={() => handleEditItem(item)}
                              />
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </TiDataTable>
                <PaginationControls
                  page={stockPage}
                  limit={STOCK_PAGE_SIZE}
                  total={stockItemsQuery.data?.total ?? 0}
                  count={stockItems.length}
                  hasMore={stockItemsQuery.data?.hasMore ?? false}
                  isFetching={stockItemsQuery.isFetching}
                  onPrevious={() => setStockPage((current) => Math.max(1, current - 1))}
                  onNext={() => setStockPage((current) => current + 1)}
                />
              </div>
            )}
          </TiQueryStatePanel>
        </div>

        {canEditStock ? (
          <section
            className={`${tiCardClassName} space-y-3 self-start xl:min-h-[280px]`}
            aria-label="Operações do estoque"
          >
            <h3 className="text-sm font-semibold text-slate-950 dark:text-white">Operações</h3>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              <StockOperationButton
                icon={LogIn}
                label="Entrada"
                onClick={() => openMovementDialog("entry")}
              />
              <StockOperationButton
                icon={LogOut}
                label="Saída"
                onClick={() => openMovementDialog("exit")}
              />
              <StockOperationButton
                icon={Tags}
                label="Categorias"
                onClick={() => setStockDialog("categories")}
              />
              <StockOperationButton
                icon={MapPin}
                label="Locais"
                onClick={() => setStockDialog("locations")}
              />
            </div>
          </section>
        ) : null}
      </div>

      <Dialog
        open={isStockDetailDialogOpen}
        onOpenChange={setIsStockDetailDialogOpen}
        title={selectedItem ? formatText(selectedItem.name, "Detalhe do item") : "Detalhe do item"}
        description="Detalhe cadastral e saldo atual do item."
        contentClassName="w-[min(92vw,720px)]"
        bodyClassName="max-h-[72vh] overflow-y-auto space-y-3"
      >
        {selectedItemQuery.isLoading && !selectedItem ? (
          <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando informações...
          </div>
        ) : null}

        {selectedItemQuery.isError ? (
          <TiInlineNotice tone="warning">
            Não foi possível atualizar o detalhe deste item. Exibindo dados da lista.
          </TiInlineNotice>
        ) : null}

        {selectedItem ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-3 dark:border-slate-700">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-normal text-slate-500 dark:text-slate-400">
                  Saldo atual
                </p>
                <p className="mt-1 text-2xl font-semibold tracking-normal text-slate-950 dark:text-white">
                  {formatQuantity(selectedItem.quantity)}
                </p>
              </div>
              <StatusBadge config={formatStatus(selectedItem.status)} size="sm" />
            </div>
            <div className="space-y-2">
              <TiFieldLine
                label="Nome"
                value={
                  <span className="break-words">
                    {formatText(selectedItem.name, "Item sem nome")}
                  </span>
                }
              />
              <TiFieldLine
                label="Categoria"
                value={
                  <span className="break-words">
                    {getRelatedName(selectedItem.category, selectedItem.category_id)}
                  </span>
                }
              />
              <TiFieldLine
                label="Local"
                value={
                  <span className="break-words">
                    {resolveTiStockLocationName(selectedItem, stockLocations)}
                  </span>
                }
              />
              {selectedItem.description ? (
                <TiFieldLine
                  label="Descrição"
                  value={<span className="break-words">{formatText(selectedItem.description)}</span>}
                />
              ) : null}
            </div>
            <section className={tiDialogSubsectionClassName} aria-label="Movimentações do estoque">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-slate-950 dark:text-white">
                  Movimentações
                </h3>
                {stockMovementsQuery.isFetching ? (
                  <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                ) : null}
              </div>

              {stockMovementsQuery.isError ? (
                <TiInlineNotice tone="warning">Histórico indisponível no momento.</TiInlineNotice>
              ) : null}

              {!stockMovementsQuery.isError &&
              !stockMovementsQuery.isLoading &&
              stockMovements.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Nenhuma movimentação registrada.
                </p>
              ) : null}

              {stockMovements.length > 0 ? (
                <div className="divide-y divide-slate-200 dark:divide-slate-700">
                  {stockMovements.map((movement) => {
                    const MovementIcon = movement.type === "entry" ? LogIn : LogOut;
                    const destination =
                      movement.destination ?? movement.location_destination_name ?? null;

                    return (
                      <div key={getId(movement.id)} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                        <span
                          className={cn(
                            "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                            movement.type === "entry"
                              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
                              : "bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300",
                          )}
                        >
                          <MovementIcon className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm font-semibold text-slate-900 dark:text-white">
                              {movement.type === "entry" ? "Entrada" : "Saída"} de{" "}
                              {formatQuantity(movement.quantity)}
                            </p>
                            <time className="text-xs text-slate-500 dark:text-slate-400">
                              {formatDateTime(movement.created_at)}
                            </time>
                          </div>
                          <p className="mt-1 break-words text-xs text-slate-500 dark:text-slate-400">
                            {getMovementActor(movement)}
                            {destination ? ` - ${destination}` : ""}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </section>
          </div>
        ) : null}
      </Dialog>

      <Dialog
        open={stockDialog === "item"}
        onOpenChange={(open) => {
          if (!open) {
            closeItemDialog();
          }
        }}
        title={editingItemId ? "Editar item" : "Novo item"}
        description="Cadastre e mantenha os itens controlados no estoque de Tecnologia."
        contentClassName="w-[min(92vw,640px)]"
        bodyClassName="max-h-[72vh] overflow-y-auto"
      >
        <form className="space-y-4" onSubmit={handleSubmitItem}>
          <div className="grid gap-3 md:grid-cols-2">
            <TiTextField
              label="Nome"
              onChange={(event) => updateItemField("name", event.target.value)}
              placeholder="Notebook reserva"
              value={itemForm.name}
            />
            <TiNativeSelect
              disabled={stockCategoriesQuery.isLoading}
              label="Categoria"
              onChange={(event) => updateItemField("category_id", event.target.value)}
              options={categoryOptions}
              value={itemForm.category_id}
            />
            <TiNativeSelect
              disabled={stockLocationsQuery.isLoading}
              label="Local"
              onChange={(event) => updateItemField("location_id", event.target.value)}
              options={locationOptions}
              value={itemForm.location_id}
            />
            {!editingItemId ? (
              <TiTextField
                label="Quantidade inicial"
                errorText={initialQuantityError}
                min={0}
                onChange={(event) => updateItemField("quantity", event.target.value)}
                type="number"
                value={itemForm.quantity}
              />
            ) : (
              <TiNativeSelect
                label="Status"
                onChange={(event) => updateItemField("status", event.target.value)}
                options={[
                  { value: "true", label: "Ativo" },
                  { value: "false", label: "Inativo" },
                ]}
                value={itemForm.status}
              />
            )}
          </div>
          <TiTextarea
            className="min-h-20"
            label="Descrição"
            onChange={(event) => updateItemField("description", event.target.value)}
            placeholder="Observações internas"
            value={itemForm.description}
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="h-10 px-4 text-sm font-semibold"
              onClick={closeItemDialog}
            >
              Cancelar
            </button>
            <TiIconAction
              icon={Save}
              type="submit"
              label={
                isItemSubmitting
                  ? "Salvando..."
                  : editingItemId
                    ? "Salvar item"
                    : "Criar item"
              }
              variant="primary"
              disabled={!canEditStock || isItemSubmitting}
            />
          </div>
        </form>
      </Dialog>

      <Dialog
        open={stockDialog === "entry"}
        onOpenChange={(open) => {
          if (!open) {
            closeEntryDialog();
          }
        }}
        title="Registrar entrada"
        description="Escolha o item e registre a quantidade adicionada ao estoque."
        contentClassName="w-[min(92vw,520px)]"
      >
        <form className="space-y-4" onSubmit={handleSubmitEntry}>
          <TiStockItemSelect selectedItem={movementItem} onSelect={setMovementItem} />
          <TiTextField
            label="Quantidade"
            min={0}
            onChange={(event) => setEntryQuantity(event.target.value)}
            type="number"
            value={entryQuantity}
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="h-10 px-4 text-sm font-semibold"
              onClick={closeEntryDialog}
            >
              Cancelar
            </button>
            <TiIconAction
              icon={LogIn}
              type="submit"
              label={createEntryMutation.isPending ? "Registrando..." : "Registrar entrada"}
              variant="primary"
              disabled={!movementItem || !canEditStock || isMovementSubmitting}
            />
          </div>
        </form>
      </Dialog>

      <Dialog
        open={stockDialog === "exit"}
        onOpenChange={(open) => {
          if (!open) {
            closeExitDialog();
          }
        }}
        title="Registrar saída"
        description="Escolha o item e registre a quantidade retirada do estoque."
        contentClassName="w-[min(92vw,720px)]"
      >
        <form className="space-y-4" onSubmit={handleSubmitExit}>
          <div className="grid gap-3 md:grid-cols-2">
            <TiStockItemSelect selectedItem={movementItem} onSelect={setMovementItem} />
            <TiTextField
              label="Quantidade"
              min={0}
              onChange={(event) => updateExitField("quantity", event.target.value)}
              type="number"
              value={exitForm.quantity}
            />
            <TiNativeSelect
              disabled={assignableUsersQuery.isLoading}
              label="Solicitante"
              onChange={(event) => updateExitField("requester_id", event.target.value)}
              options={userOptions}
              value={exitForm.requester_id}
            />
            <TiTextField
              label="Destino"
              onChange={(event) => updateExitField("destination", event.target.value)}
              placeholder="Sala, colaborador ou projeto"
              value={exitForm.destination}
            />
            <TiNativeSelect
              label="Local destino"
              onChange={(event) => updateExitField("location_destination_id", event.target.value)}
              options={locationOptions}
              value={exitForm.location_destination_id}
            />
            <TiNativeSelect
              disabled={assignableUsersQuery.isLoading}
              label="Aprovador"
              onChange={(event) => updateExitField("approver_id", event.target.value)}
              options={userOptions}
              value={exitForm.approver_id}
            />
            <TiNativeSelect
              disabled={assignableUsersQuery.isLoading}
              label="Operador"
              onChange={(event) => updateExitField("operator_id", event.target.value)}
              options={userOptions}
              value={exitForm.operator_id}
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="h-10 px-4 text-sm font-semibold"
              onClick={closeExitDialog}
            >
              Cancelar
            </button>
            <TiIconAction
              icon={LogOut}
              type="submit"
              label={createExitMutation.isPending ? "Registrando..." : "Registrar saída"}
              variant="primary"
              disabled={!movementItem || !canEditStock || isMovementSubmitting}
            />
          </div>
        </form>
      </Dialog>

      <ConfirmationDialog
        open={pendingExitConfirmation !== null}
        onOpenChange={(open) => {
          if (!open && !createExitMutation.isPending) {
            setPendingExitConfirmation(null);
            setExitConfirmationError(null);
          }
        }}
        title="Confirmar saída"
        description="Deseja confirmar a saída deste item do estoque?"
        onConfirm={handleConfirmExit}
        isConfirming={createExitMutation.isPending}
        errorMessage={exitConfirmationError}
        confirmLabel="Registrar saída"
        cancelLabel="Cancelar"
        variant="destructive"
      />

      <Dialog
        open={stockDialog === "categories"}
        onOpenChange={(open) => {
          if (!open) {
            closeCategoryDialog();
          }
        }}
        title="Categorias de estoque"
        description="Gerencie as categorias usadas nos itens do estoque."
        contentClassName="w-[min(92vw,760px)]"
        bodyClassName="max-h-[72vh] overflow-y-auto"
      >
        <div className="space-y-4">
          <section className={tiDialogSubsectionClassName}>
            <div className="mb-4 flex items-center gap-2">
              <Tags className="h-4 w-4 text-blue-600 dark:text-blue-300" />
              <h3 className="text-base font-semibold text-slate-950 dark:text-white">
                Adicionar categoria
              </h3>
            </div>
            <form
              className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]"
              onSubmit={handleSubmitCategory}
            >
              <TiTextField
                label="Nome"
                onChange={(event) => setCategoryName(event.target.value)}
                placeholder="Periféricos"
                value={categoryName}
              />
              <div className="flex items-end">
                <TiIconAction
                  icon={Plus}
                  type="submit"
                  label={createCategoryMutation.isPending ? "Criando..." : "Criar"}
                  variant="primary"
                  disabled={!canEditStock || createCategoryMutation.isPending || hasExactCategoryName}
                />
              </div>
            </form>
            {normalizedCategorySearch ? (
              hasExactCategoryName ? (
                <TiInlineNotice tone="warning">
                  Já existe uma categoria cadastrada com este nome.
                </TiInlineNotice>
              ) : filteredStockCategories.length === 0 ? (
                <TiInlineNotice>
                  Nenhuma categoria correspondente. Você pode criar uma nova categoria.
                </TiInlineNotice>
              ) : null
            ) : null}
          </section>

          <section className="space-y-3">
            <h3 className="text-base font-semibold text-slate-950 dark:text-white">
              Categorias cadastradas
            </h3>
            <MiniResourceList
              emptyLabel="Nenhuma categoria cadastrada."
              icon={Layers3}
              rows={filteredStockCategories}
            />
          </section>
        </div>
      </Dialog>

      <Dialog
        open={stockDialog === "locations"}
        onOpenChange={(open) => {
          if (!open) {
            closeLocationDialog();
          }
        }}
        title="Locais de estoque"
        description="Gerencie os locais usados nos itens do estoque."
        contentClassName="w-[min(92vw,760px)]"
        bodyClassName="max-h-[72vh] overflow-y-auto"
      >
        <div className="space-y-4">
          <section className={tiDialogSubsectionClassName}>
            <div className="mb-4 flex items-center gap-2">
              <MapPin className="h-4 w-4 text-blue-600 dark:text-blue-300" />
              <h3 className="text-base font-semibold text-slate-950 dark:text-white">
                Adicionar local
              </h3>
            </div>
            <form
              className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_120px_auto]"
              onSubmit={handleSubmitLocation}
            >
              <TiTextField
                label="Nome"
                onChange={(event) => setLocationName(event.target.value)}
                placeholder="Almoxarifado"
                value={locationName}
              />
              <TiTextField
                label="Andar"
                onChange={(event) => setLocationFloor(event.target.value)}
                type="number"
                value={locationFloor}
              />
              <div className="flex items-end">
                <TiIconAction
                  icon={Plus}
                  type="submit"
                  label={createLocationMutation.isPending ? "Criando..." : "Criar"}
                  variant="primary"
                  disabled={
                    !canEditStock ||
                    createLocationMutation.isPending ||
                    hasActiveTiStockLocation(stockLocations, locationName)
                  }
                />
              </div>
            </form>
          </section>

          <section className="space-y-3">
            <h3 className="text-base font-semibold text-slate-950 dark:text-white">
              Locais cadastrados
            </h3>
            <MiniResourceList
              emptyLabel={locationName.trim() ? "Nenhum local encontrado." : "Nenhum local cadastrado."}
              icon={MapPin}
              rows={filteredStockLocations}
            />
          </section>
        </div>
      </Dialog>
    </TiPanel>
  );
}

function StockOperationButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        tiSecondaryButtonClassName,
        "w-full min-w-0 sm:w-auto sm:min-w-32",
      )}
      onClick={onClick}
      title={label}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  );
}

function MiniResourceList<TItem extends TiStockCategory | TiStockLocation>({
  emptyLabel,
  icon: Icon,
  rows,
}: {
  emptyLabel: string;
  icon: LucideIcon;
  rows: TItem[];
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">{emptyLabel}</p>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {rows.map((row) => (
        <span
          key={getId(row.id)}
          className="inline-flex min-h-8 items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
        >
          <Icon className="h-3.5 w-3.5 shrink-0" />
          {formatText(row.name, "Sem nome")}
        </span>
      ))}
    </div>
  );
}
