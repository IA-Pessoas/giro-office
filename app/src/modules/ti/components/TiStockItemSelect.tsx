import { useDeferredValue, useState } from "react";

import { useTiStockItems } from "../hooks";
import type { TiStockItem } from "../types";
import { buildTiStockMovementItemOptions } from "../utils/stockMovementItems";
import { TiNativeSelect } from "./TiNativeSelect";
import { TiTextField } from "./tiFormControls";

// Limite do backend para page_size; acima disso a busca por nome refina a lista.
const MOVEMENT_ITEM_PAGE_SIZE = 100;

interface TiStockItemSelectProps {
  selectedItem: TiStockItem | null;
  onSelect: (item: TiStockItem | null) => void;
}

export function TiStockItemSelect({ selectedItem, onSelect }: TiStockItemSelectProps) {
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim());
  const itemsQuery = useTiStockItems(
    { name: deferredSearch || undefined, page: 1, page_size: MOVEMENT_ITEM_PAGE_SIZE },
  );
  const items = itemsQuery.data?.data ?? [];
  const total = itemsQuery.data?.total ?? items.length;

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <TiTextField
        label="Buscar item"
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Digite o nome do item"
        type="search"
        value={search}
      />
      <TiNativeSelect
        disabled={itemsQuery.isLoading}
        helperText={
          itemsQuery.isError
            ? "Não foi possível carregar os itens. Tente buscar de novo."
            : !itemsQuery.isLoading && items.length === 0
              ? "Nenhum item encontrado."
              : total > items.length
                ? `Mostrando ${items.length} de ${total} itens. Busque pelo nome para encontrar os demais.`
                : undefined
        }
        label="Item"
        onChange={(event) =>
          onSelect(
            [selectedItem, ...items].find((item) => item && String(item.id) === event.target.value) ??
              null,
          )
        }
        options={buildTiStockMovementItemOptions(items, selectedItem)}
        value={selectedItem ? String(selectedItem.id) : ""}
      />
    </div>
  );
}
