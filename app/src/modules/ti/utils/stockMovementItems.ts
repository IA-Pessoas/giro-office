import type { TiStockItem } from "../types";

type StockItemLike = Pick<TiStockItem, "id" | "name" | "quantity">;

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

// Saldo disponível quando a saída passa dele; null quando cabe ou o saldo é desconhecido.
export function getTiStockExitShortage(item: StockItemLike | null, quantity: number): number | null {
  if (typeof item?.quantity !== "number") {
    return null;
  }

  return quantity > item.quantity ? item.quantity : null;
}
