import type { TiStockItem, TiStockLocation } from "../types";

const STOCK_LOCATION_FALLBACK = "Local não informado";

function getLocationName(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized || null;
}

export function normalizeTiStockLocationName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase();
}

export function filterTiStockLocations(
  locations: TiStockLocation[],
  query: string,
): TiStockLocation[] {
  const normalizedQuery = normalizeTiStockLocationName(query);

  if (!normalizedQuery) {
    return locations;
  }

  return locations.filter((location) =>
    normalizeTiStockLocationName(location.name ?? "").includes(normalizedQuery),
  );
}

export function hasActiveTiStockLocation(locations: TiStockLocation[], name: string): boolean {
  const normalizedName = normalizeTiStockLocationName(name);

  if (!normalizedName) {
    return false;
  }

  return locations.some(
    (location) =>
      location.status !== false &&
      location.status !== "inactive" &&
      normalizeTiStockLocationName(location.name ?? "") === normalizedName,
  );
}

export function resolveTiStockLocationName(
  item: TiStockItem,
  locations: TiStockLocation[],
): string {
  const relationName = getLocationName(item.location?.name);

  if (relationName) {
    return relationName;
  }

  const registeredLocation = locations.find(
    (location) => String(location.id) === String(item.location_id ?? ""),
  );

  return getLocationName(registeredLocation?.name) ?? STOCK_LOCATION_FALLBACK;
}
