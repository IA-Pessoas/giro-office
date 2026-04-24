/**
 * Remove caracteres não numéricos (alinhado ao legado `cleanDocument`).
 */
export function cleanDocument(doc: string | null | undefined): string {
  if (!doc) {
    return "";
  }
  return doc.replace(/\D/g, "");
}
