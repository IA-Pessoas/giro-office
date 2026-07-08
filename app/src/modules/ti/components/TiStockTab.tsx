import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
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
import { TiIconAction, TiPanel, TiSectionHeader } from "./tiFormControls";
import {
  tiInputClassName,
  tiLabelClassName,
  tiPrimaryButtonClassName,
  tiSecondaryButtonClassName,
} from "./tiWorkspaceUi";

type ListQuery<T> = Pick<
  UseQueryResult<T[], Error>,
  "data" | "error" | "isError" | "isFetching" | "isLoading" | "refetch"
>;

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
    return "Acesso negado para executar esta acao.";
  }

  if (/409|conflict|saldo|insuficiente/i.test(message)) {
    return message || "Nao foi possivel concluir por conflito de dados.";
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

function QueryStatePanel<T>({
  children,
  emptyTitle,
  icon: Icon,
  query,
}: {
  children: (rows: T[]) => ReactNode;
  emptyTitle: string;
  icon: LucideIcon;
  query: ListQuery<T>;
}) {
  if (query.isLoading) {
    return (
      <div className="flex min-h-32 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-6 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando dados...
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900/40 dark:bg-red-950/20">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-red-700 dark:text-red-300">
              Nao foi possivel carregar.
            </p>
            <p className="mt-1 text-sm text-red-600 dark:text-red-300/80">
              {query.error?.message ?? "Tente novamente."}
            </p>
          </div>
          <TiIconAction
            icon={RefreshCw}
            label="Tentar novamente"
            onClick={() => {
              void query.refetch();
            }}
          />
        </div>
      </div>
    );
  }

  const rows = query.data ?? [];

  if (rows.length === 0) {
    return (
      <div className="flex min-h-32 items-center gap-4 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5 dark:border-slate-700 dark:bg-slate-900/60">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-slate-700 shadow-sm dark:bg-slate-950 dark:text-slate-200">
          <Icon className="h-5 w-5" />
        </div>
        <p className="text-sm font-medium text-slate-600 dark:text-slate-300">{emptyTitle}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {query.isFetching ? (
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Atualizando...
        </div>
      ) : null}
      {children(rows)}
    </div>
  );
}

function FieldLine({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-2 last:border-b-0 last:pb-0 dark:border-slate-800">
      <span className="shrink-0 text-xs font-semibold uppercase tracking-normal text-slate-500 dark:text-slate-500">
        {label}
      </span>
      <span className="min-w-0 text-right text-sm font-medium text-slate-800 dark:text-slate-100">
        {value}
      </span>
    </div>
  );
}

function CompactTextField({
  label,
  onChange,
  placeholder,
  type = "text",
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: "number" | "text";
  value: string;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-2">
      <span className={tiLabelClassName}>{label}</span>
      <input
        className={tiInputClassName}
        min={type === "number" ? 0 : undefined}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type={type}
        value={value}
      />
    </label>
  );
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
      toast.error("Informe uma quantidade inicial valida.");
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
      toast.error(getMutationErrorMessage(error, "Nao foi possivel salvar o item."));
    }
  }

  async function handleSubmitEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedItemId || !canEditStock || isMovementSubmitting) {
      return;
    }

    const quantity = toPositiveNumber(entryQuantity);

    if (quantity === null) {
      toast.error("Informe uma quantidade de entrada valida.");
      return;
    }

    try {
      await createEntryMutation.mutateAsync({ id: selectedItemId, payload: { quantity } });
      setEntryQuantity("");
      toast.success("Entrada registrada com sucesso.");
    } catch (error) {
      toast.error(getMutationErrorMessage(error, "Nao foi possivel registrar a entrada."));
    }
  }

  async function handleSubmitExit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedItemId || !canEditStock || isMovementSubmitting) {
      return;
    }

    const quantity = toPositiveNumber(exitForm.quantity);

    if (quantity === null) {
      toast.error("Informe uma quantidade de saida valida.");
      return;
    }

    if (!exitForm.requester_id) {
      toast.error("Selecione o solicitante da saida.");
      return;
    }

    const confirmed = window.confirm("Confirmar saida do estoque?");

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
      toast.success("Saida registrada com sucesso.");
    } catch (error) {
      toast.error(getMutationErrorMessage(error, "Nao foi possivel registrar a saida."));
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
      toast.error(getMutationErrorMessage(error, "Nao foi possivel criar a categoria."));
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
      toast.error(getMutationErrorMessage(error, "Nao foi possivel criar o local."));
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
        description="Controle itens, entradas, saidas, categorias, locais e niveis minimos."
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
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>Seu perfil atual permite consulta, mas nao alteracoes de estoque.</p>
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
        <div className="space-y-4">
          <form
            className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900 md:grid-cols-[minmax(0,1fr)_auto]"
            onSubmit={applySearchFilter}
          >
            <CompactTextField
              label="Buscar item"
              onChange={setSearchDraft}
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

          <QueryStatePanel
            emptyTitle="Nenhum item em estoque."
            icon={PackageSearch}
            query={stockItemsQuery}
          >
            {(items) => (
              <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold">Item</th>
                      <th className="px-4 py-3 text-left font-semibold">Categoria</th>
                      <th className="px-4 py-3 text-left font-semibold">Local</th>
                      <th className="px-4 py-3 text-right font-semibold">Qtd.</th>
                      <th className="px-4 py-3 text-left font-semibold">Status</th>
                      <th className="px-4 py-3 text-right font-semibold">Acoes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
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
                              <button
                                type="button"
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                                onClick={() => handleSelectItem(item)}
                                title="Abrir detalhe"
                              >
                                <PackageCheck className="h-4 w-4" />
                              </button>
                              {canEditStock ? (
                                <button
                                  type="button"
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                                  onClick={() => handleEditItem(item)}
                                  title="Editar item"
                                >
                                  <Pencil className="h-4 w-4" />
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </QueryStatePanel>
        </div>

        <div className="space-y-4">
          <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
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
                <FieldLine label="Nome" value={formatText(selectedItem.name, "Item sem nome")} />
                <FieldLine
                  label="Categoria"
                  value={getRelatedName(selectedItem.category, selectedItem.category_id)}
                />
                <FieldLine
                  label="Local"
                  value={getRelatedName(selectedItem.location, selectedItem.location_id)}
                />
                <FieldLine label="Quantidade" value={formatQuantity(selectedItem.quantity)} />
                <FieldLine
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
            className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"
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

            <CompactTextField
              label="Nome"
              onChange={(value) => updateItemField("name", value)}
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
              <CompactTextField
                label="Quantidade inicial"
                onChange={(value) => updateItemField("quantity", value)}
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
            <label className="flex min-w-0 flex-col gap-2">
              <span className={tiLabelClassName}>Descricao</span>
              <textarea
                className={cn(tiInputClassName, "min-h-20 py-2")}
                onChange={(event) => updateItemField("description", event.target.value)}
                placeholder="Observacoes internas"
                value={itemForm.description}
              />
            </label>
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
          className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"
          onSubmit={handleSubmitEntry}
        >
          <div className="flex items-center gap-2">
            <LogIn className="h-4 w-4 text-green-600 dark:text-green-300" />
            <h3 className="text-sm font-semibold text-slate-950 dark:text-white">Entrada</h3>
          </div>
          <CompactTextField
            label="Quantidade"
            onChange={setEntryQuantity}
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
          className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"
          onSubmit={handleSubmitExit}
        >
          <div className="flex items-center gap-2">
            <LogOut className="h-4 w-4 text-orange-600 dark:text-orange-300" />
            <h3 className="text-sm font-semibold text-slate-950 dark:text-white">Saida</h3>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <CompactTextField
              label="Quantidade"
              onChange={(value) => updateExitField("quantity", value)}
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
            <CompactTextField
              label="Destino"
              onChange={(value) => updateExitField("destination", value)}
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
            <span>Registrar saida</span>
          </button>
        </form>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center gap-2">
            <Tags className="h-4 w-4 text-blue-600 dark:text-blue-300" />
            <h3 className="text-sm font-semibold text-slate-950 dark:text-white">Categorias</h3>
          </div>
          <form className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]" onSubmit={handleSubmitCategory}>
            <CompactTextField
              label="Nome"
              onChange={setCategoryName}
              placeholder="Perifericos"
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

        <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-blue-600 dark:text-blue-300" />
            <h3 className="text-sm font-semibold text-slate-950 dark:text-white">Locais</h3>
          </div>
          <form className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_120px_auto]" onSubmit={handleSubmitLocation}>
            <CompactTextField
              label="Nome"
              onChange={setLocationName}
              placeholder="Almoxarifado"
              value={locationName}
            />
            <CompactTextField
              label="Andar"
              onChange={setLocationFloor}
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
