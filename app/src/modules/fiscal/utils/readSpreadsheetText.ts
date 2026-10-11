/** Texto do arquivo em UTF-8; exportações de sistemas fiscais em Windows-1252 caem no fallback. */
export async function readSpreadsheetText(file: File): Promise<string> {
  const bytes = await file.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}
