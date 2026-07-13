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
import { toast } from "react-toastify";

import { useModuleAccess } from "@modules/auth";
import { useAssignableUsers } from "@modules/rh";
import { StatusBadge, type StatusBadgeConfig } from "@shared/components/StatusBadge";
import { cn } from "@shared/ui/newLayout/utils";

import {
  useCreateTiStockCategoryMutation,
  useCreateTiStockEntryMutation,
  useCreateTiStockExitMutation,
  useCreateTiStockItemMutation,
  useCreateTiStockLocationMutation,
  useTiStockCategories,
  useTiStockItem,
  useTiStockItems,
  useTiStockLocations,
  useUpdateTiStockItemMutation,
} from "../hooks";
import type {
  TiId,
  TiListFilters,
  TiStockCategory,
  TiStockItem,
  TiStockItemCreatePayload,
  TiStockItemUpdatePayload,
  TiStockLocation,
} from "../types";
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
  TiTextField,
  TiTextarea,
} from "./tiFormControls";
import {
  tiCardClassName,
  tiPrimaryButtonClassName,
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
  const [searchDraft, setSearchDraft] = useState("");
  const [selectedItemId, setSelectedItemId] = useState<TiId | undefined>();
  const [itemForm, setItemForm] = useState<StockItemFormState>(initialItemFormState);
  const [editingItemId, setEditingItemId] = useState<TiId | undefined>();
  const [entryQuantity, setEntryQuantity] = useState("");
  const [exitForm, setExitForm] = useState<StockExitFormState>(initialExitFormState);
  const [categoryName, setCategoryName] = useState("");
  const [locationName, setLocationName] = useState("");
  const [locationFloor, setLocationFloor] = useState("");

  const stockItemsQuery = useTiStockItems(filters);
  const selectedItemQuery = useTiStockItem(selectedItemId, { enabled: Boolean(selectedItemId) });
  const stockCategoriesQuery = useTiStockCategories();
  const stockLocationsQuery = useTiStockLocations();
  const assignableUsersQuery = useAssignableUsers({ enabled: canEditStock });

  const createItemMutation = useCreateTiStockItemMutation();
  const updateItemMutation = useUpdateTiStockItemMutation();
  const createEntryMutation = useCreateTiStockEntryMutation();
  const createExitMutation = useCreateTiStockExitMutation();
  const createCategoryMutation = useCreateTiStockCategoryMutation();
  const createLocationMutation = useCreateTiStockLocationMutation();

  const stockCategories = stockCategoriesQuery.data ?? [];
  const stockLocations = stockLocationsQuery.data ?? [];
  const users = assignableUsersQuery.data ?? [];
  const selectedItem = selectedItemQuery.data;
  const isItemSubmitting = createItemMutation.isPending || updateItemMutation.isPending;
  const isMovementSubmitting = createEntryMutation.isPending || createExitMutation.isPending;

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

  function handleSelectItem(item: TiStockItem) {
    setSelectedItemId(item.id);
    setEditingItemId(undefined);
    setItemForm(initialItemFormState);
    setEntryQuantity("");
    setExitForm(initialExitFormState);
  }

  function handleEditItem(item: TiStockItem) {
    setSelectedItemId(item.id);
    setEditingItemId(item.id);
    setItemForm(buildItemFormState(item));
  }

  function resetItemForm() {
    setEditingItemId(undefined);
    setItemForm(initialItemFormState);
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
    } catch (error) {
      toast.error(getMutationErrorMessage(error, "Não foi possível salvar o item."));
    }
  }

  async function handleSubmitEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedItemId || !canEditStock || isMovementSubmitting) {
      return;
    }

    const quantity = toPositiveNumber(entryQuantity);

    if (quantity === null) {
      toast.error("Informe uma quantidade de entrada válida.");
      return;
    }

    try {
      await createEntryMutation.mutateAsync({ id: selectedItemId, payload: { quantity } });
      setEntryQuantity("");
      toast.success("Entrada registrada com sucesso.");
    } catch (error) {
      toast.error(getMutationErrorMessage(error, "Não foi possível registrar a entrada."));
    }
  }

  async function handleSubmitExit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedItemId || !canEditStock || isMovementSubmitting) {
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

    const confirmed = window.confirm("Confirmar saída do estoque?");

    if (!confirmed) {
      return;
    }

    try {
      await createExitMutation.mutateAsync({
        id: selectedItemId,
        payload: {
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
        },
      });
      setExitForm(initialExitFormState);
      toast.success("Saída registrada com sucesso.");
    } catch (error) {
      toast.error(getMutationErrorMessage(error, "Não foi possível registrar a saída."));
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

    try {
      await createLocationMutation.mutateAsync({
        name,
        ...(toOptionalFloor(locationFloor) !== undefined
          ? { floor: toOptionalFloor(locationFloor) }
          : {}),
      });
      setLocationName("");
      setLocationFloor("");
      toast.success("Local criado com sucesso.");
    } catch (error) {
      toast.error(getMutationErrorMessage(error, "Não foi possível criar o local."));
    }
  }

  function applySearchFilter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFilters((current) => ({
      ...current,
      name: toOptionalText(searchDraft),
    }));
  }

  return (
    <TiPanel className="space-y-5">
      <TiSectionHeader
        title="Estoque"
        description="Controle itens, entradas, saídas, categorias, locais e níveis mínimos."
        action={
          <TiIconAction
            icon={RefreshCw}
            label="Atualizar"
            onClick={() => {
              void stockItemsQuery.refetch();
            }}
          />
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

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
        <div className="space-y-4">
          <form
            className={`${tiCardClassName} grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]`}
            onSubmit={applySearchFilter}
          >
            <TiTextField
              label="Buscar item"
              onChange={(event) => setSearchDraft(event.target.value)}
              placeholder="Nome do item"
              value={searchDraft}
            />
            <div className="flex items-end">
              <button type="submit" className={tiSecondaryButtonClassName}>
                <PackageSearch className="h-4 w-4" />
                <span>Filtrar</span>
              </button>
            </div>
          </form>

          <TiQueryStatePanel
            emptyState={
              <TiEmptyState
                icon={PackageSearch}
                title="Nenhum item em estoque"
                description="Itens de Tecnologia aparecem aqui quando forem cadastrados."
              />
            }
            query={stockItemsQuery}
          >
            {(items) => (
              <TiDataTable headers={["Item", "Categoria", "Local", "Qtd.", "Status", ""]}>
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
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          className="text-left font-semibold text-slate-900 hover:text-blue-700 dark:text-white dark:hover:text-blue-300"
                          onClick={() => handleSelectItem(item)}
                        >
                          {formatText(item.name, "Item sem nome")}
                        </button>
                        {item.description ? (
                          <p className="mt-1 max-w-sm text-xs text-slate-500 dark:text-slate-400">
                            {formatText(item.description)}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        {getRelatedName(item.category, item.category_id)}
                      </td>
                      <td className="px-4 py-3">
                        {getRelatedName(item.location, item.location_id)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold">
                        {formatQuantity(item.quantity)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge config={formatStatus(item.status)} size="sm" />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <TiTableAction
                            icon={PackageCheck}
                            label="Abrir"
                            onClick={() => handleSelectItem(item)}
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
            )}
          </TiQueryStatePanel>
        </div>

        <div className="space-y-4">
          <section className={tiCardClassName}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-slate-950 dark:text-white">
                Item selecionado
              </h3>
              {selectedItemQuery.isFetching ? (
                <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
              ) : null}
            </div>
            {selectedItem ? (
              <div className="space-y-2">
                <TiFieldLine label="Nome" value={formatText(selectedItem.name, "Item sem nome")} />
                <TiFieldLine
                  label="Categoria"
                  value={getRelatedName(selectedItem.category, selectedItem.category_id)}
                />
                <TiFieldLine
                  label="Local"
                  value={getRelatedName(selectedItem.location, selectedItem.location_id)}
                />
                <TiFieldLine label="Quantidade" value={formatQuantity(selectedItem.quantity)} />
                <TiFieldLine
                  label="Status"
                  value={<StatusBadge config={formatStatus(selectedItem.status)} size="sm" />}
                />
              </div>
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Selecione um item para ver detalhes e movimentar saldo.
              </p>
            )}
          </section>

          <form
            className={`${tiCardClassName} space-y-3`}
            onSubmit={handleSubmitItem}
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-slate-950 dark:text-white">
                {editingItemId ? "Editar item" : "Novo item"}
              </h3>
              {editingItemId ? (
                <button
                  type="button"
                  className="text-xs font-semibold text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                  onClick={resetItemForm}
                >
                  Cancelar
                </button>
              ) : null}
            </div>

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
            <TiTextarea
              className="min-h-20"
              label="Descrição"
              onChange={(event) => updateItemField("description", event.target.value)}
              placeholder="Observações internas"
              value={itemForm.description}
            />
            <button
              type="submit"
              className={tiPrimaryButtonClassName}
              disabled={!canEditStock || isItemSubmitting}
            >
              {isItemSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              <span>{editingItemId ? "Salvar item" : "Criar item"}</span>
            </button>
          </form>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <form
          className={`${tiCardClassName} space-y-3`}
          onSubmit={handleSubmitEntry}
        >
          <div className="flex items-center gap-2">
            <LogIn className="h-4 w-4 text-green-600 dark:text-green-300" />
            <h3 className="text-sm font-semibold text-slate-950 dark:text-white">Entrada</h3>
          </div>
          <TiTextField
            label="Quantidade"
            min={0}
            onChange={(event) => setEntryQuantity(event.target.value)}
            type="number"
            value={entryQuantity}
          />
          <button
            type="submit"
            className={tiSecondaryButtonClassName}
            disabled={!selectedItemId || !canEditStock || isMovementSubmitting}
          >
            {createEntryMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <LogIn className="h-4 w-4" />
            )}
            <span>Registrar entrada</span>
          </button>
        </form>

        <form
          className={`${tiCardClassName} space-y-3`}
          onSubmit={handleSubmitExit}
        >
          <div className="flex items-center gap-2">
            <LogOut className="h-4 w-4 text-orange-600 dark:text-orange-300" />
            <h3 className="text-sm font-semibold text-slate-950 dark:text-white">Saida</h3>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
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
          <button
            type="submit"
            className={tiSecondaryButtonClassName}
            disabled={!selectedItemId || !canEditStock || isMovementSubmitting}
          >
            {createExitMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <LogOut className="h-4 w-4" />
            )}
            <span>Registrar saída</span>
          </button>
        </form>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className={`${tiCardClassName} space-y-4`}>
          <div className="flex items-center gap-2">
            <Tags className="h-4 w-4 text-blue-600 dark:text-blue-300" />
            <h3 className="text-sm font-semibold text-slate-950 dark:text-white">Categorias</h3>
          </div>
          <form className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]" onSubmit={handleSubmitCategory}>
            <TiTextField
              label="Nome"
              onChange={(event) => setCategoryName(event.target.value)}
              placeholder="Periféricos"
              value={categoryName}
            />
            <div className="flex items-end">
              <button
                type="submit"
                className={tiSecondaryButtonClassName}
                disabled={!canEditStock || createCategoryMutation.isPending}
              >
                <Plus className="h-4 w-4" />
                <span>Criar</span>
              </button>
            </div>
          </form>
          <MiniResourceList
            emptyLabel="Nenhuma categoria cadastrada."
            icon={Layers3}
            rows={stockCategories}
          />
        </section>

        <section className={`${tiCardClassName} space-y-4`}>
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-blue-600 dark:text-blue-300" />
            <h3 className="text-sm font-semibold text-slate-950 dark:text-white">Locais</h3>
          </div>
          <form className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_120px_auto]" onSubmit={handleSubmitLocation}>
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
              <button
                type="submit"
                className={tiSecondaryButtonClassName}
                disabled={!canEditStock || createLocationMutation.isPending}
              >
                <Plus className="h-4 w-4" />
                <span>Criar</span>
              </button>
            </div>
          </form>
          <MiniResourceList
            emptyLabel="Nenhum local cadastrado."
            icon={MapPin}
            rows={stockLocations}
          />
        </section>
      </div>
    </TiPanel>
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
