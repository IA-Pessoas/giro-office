import { useState } from "react";
import { ChevronLeft, ChevronRight, FileClock, Loader2 } from "lucide-react";

import { formatDateTime } from "@shared/utils/dateFormat";

import { useTiChangeHistory } from "../hooks";
import type { TiChangeHistoryItem, TiChangeHistoryItemType } from "../types";
import { TiNativeSelect } from "./TiNativeSelect";
import {
  TiDataTable,
  TiEmptyState,
  TiInlineNotice,
  TiPanel,
  TiSectionHeader,
} from "./tiFormControls";
import { tiSecondaryButtonClassName } from "./tiWorkspaceUi";

const ITEM_TYPE_LABELS: Record<TiChangeHistoryItemType, string> = {
  inventory: "Inventário",
  inventory_category: "Categoria de inventário",
  term: "Termo",
  password: "Senha",
  robot: "Robô",
};

const ITEM_TYPE_OPTIONS = [
  { value: "", label: "Todos" },
  ...Object.entries(ITEM_TYPE_LABELS).map(([value, label]) => ({ value, label })),
];

// Campos gravados pela edição de inventário; registro migrado traz o nome do campo do legado.
const FIELD_LABELS: Record<string, string> = {
  asset_code: "Código",
  category: "Categoria",
  notes: "Observação",
  delivery_date: "Data de entrega",
  responsible_it_staff: "TI responsável",
};

function formatItem(item: TiChangeHistoryItem): string {
  const type = ITEM_TYPE_LABELS[item.item_type] ?? item.item_type;

  return item.item_label ? `${type} ${item.item_label}` : type;
}

function formatValue(item: TiChangeHistoryItem, value: string | null): string {
  if (item.masked) {
    return "Oculto";
  }

  return value ?? "-";
}

export function TiChangeHistoryTab() {
  const [itemType, setItemType] = useState<TiChangeHistoryItemType | "">("");
  const [page, setPage] = useState(1);

  const changeHistoryQuery = useTiChangeHistory(itemType || undefined, page);
  const changeHistory = changeHistoryQuery.data;

  return (
    <TiPanel className="space-y-5">
      <TiSectionHeader
        title="Histórico de alterações"
        description="Campos alterados nos itens de Tecnologia, com o valor anterior e o novo. Movimentações de inventário, estoque e acessos ficam nas próprias telas."
      />

      <div className="max-w-md">
        <TiNativeSelect
          label="Tipo de item"
          onChange={(event) => {
            setItemType(event.target.value as TiChangeHistoryItemType | "");
            setPage(1);
          }}
          options={ITEM_TYPE_OPTIONS}
          value={itemType}
        />
      </div>

      {changeHistoryQuery.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Carregando histórico de alterações...</span>
        </div>
      ) : null}

      {changeHistoryQuery.isError ? (
        <TiInlineNotice tone="danger">
          Não foi possível carregar o histórico de alterações.
        </TiInlineNotice>
      ) : null}

      {changeHistory && changeHistory.items.length === 0 ? (
        <TiEmptyState
          icon={FileClock}
          title="Nenhuma alteração registrada"
          description={
            page > 1
              ? "Não há alterações mais antigas para este filtro."
              : "As edições de itens de Tecnologia aparecem aqui."
          }
        />
      ) : null}

      {changeHistory && changeHistory.items.length > 0 ? (
        <TiDataTable headers={["Data", "Item", "Ação", "Campo", "Antes", "Depois", "Autor"]}>
          {changeHistory.items.map((item) => (
            <tr key={item.id} className="text-slate-700 dark:text-slate-200">
              <td className="px-4 py-2">{formatDateTime(item.created_at, "-")}</td>
              <td className="px-4 py-2">{formatItem(item)}</td>
              <td className="px-4 py-2">{item.note ?? "-"}</td>
              <td className="px-4 py-2">{FIELD_LABELS[item.field] ?? item.field}</td>
              <td className="px-4 py-2">{formatValue(item, item.before)}</td>
              <td className="px-4 py-2">{formatValue(item, item.after)}</td>
              <td className="px-4 py-2">{item.actor?.full_name ?? item.actor?.name ?? "-"}</td>
            </tr>
          ))}
        </TiDataTable>
      ) : null}

      {changeHistory ? (
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            className={tiSecondaryButtonClassName}
            disabled={page === 1 || changeHistoryQuery.isFetching}
            onClick={() => setPage((current) => current - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
            <span>Mais recentes</span>
          </button>
          <span className="text-sm text-slate-600 dark:text-slate-300">Página {page}</span>
          <button
            type="button"
            className={tiSecondaryButtonClassName}
            disabled={!changeHistory.has_more || changeHistoryQuery.isFetching}
            onClick={() => setPage((current) => current + 1)}
          >
            <span>Mais antigas</span>
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      ) : null}
    </TiPanel>
  );
}
