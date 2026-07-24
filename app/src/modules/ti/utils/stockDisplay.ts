import type { TiStockItem, TiStockLocation } from "../types";

const STOCK_LOCATION_FALLBACK = "Local não informado";

function normalizeLocationName(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized || null;
}

export function resolveTiStockLocationName(
  item: TiStockItem,
  locations: TiStockLocation[],
): string {
  const relationName = normalizeLocationName(item.location?.name);

  if (relationName) {
    return relationName;
  }

  const registeredLocation = locations.find(
    (location) => String(location.id) === String(item.location_id ?? ""),
  );

  return normalizeLocationName(registeredLocation?.name) ?? STOCK_LOCATION_FALLBACK;
}
