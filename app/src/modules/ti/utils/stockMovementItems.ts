import type { TiStockItem } from "../types";

type StockItemLike = Pick<TiStockItem, "id" | "name">;

// O item escolhido continua como opção mesmo quando a busca atual não o traz.
export function buildTiStockMovementItemOptions(
  results: StockItemLike[],
  selected: StockItemLike | null,
): { value: string; label: string }[] {
  const toOption = (item: StockItemLike) => ({
    value: String(item.id),
    label: item.name || "Item sem nome",
  });
  const selectedMissing =
    selected !== null && !results.some((item) => String(item.id) === String(selected.id));

  return [
    { value: "", label: "Selecione" },
    ...(selectedMissing ? [toOption(selected)] : []),
    ...results.map(toOption),
  ];
}
