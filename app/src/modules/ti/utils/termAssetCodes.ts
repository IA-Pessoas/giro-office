type TermAssetFields = { asset_code?: string | null; equipament_list?: string | null };

function normalize(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

// Um termo pode citar vários ativos no mesmo campo ("MS27CASTELO, N30CASTELO"), como no
// reparo infra/prisma/repairs/backfill-ti-inventory-from-terms.sql (#1380).
export function termCitesAsset(term: TermAssetFields, assetCode: unknown): boolean {
  const code = normalize(assetCode);
  if (!code) {
    return false;
  }
  const codes = String(term.asset_code ?? "")
    .split(/[,;]/)
    .map(normalize);
  return codes.includes(code) || normalize(term.equipament_list).includes(code);
}
