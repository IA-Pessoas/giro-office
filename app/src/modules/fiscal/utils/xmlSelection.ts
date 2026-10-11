/** Pedidos de nota colados pela equipe: um por linha ou separados por vírgula. */
export function parseNoteRequests(text: string): string[] {
  return text
    .split(/[\n,]+/u)
    .map((item) => item.trim())
    .filter(Boolean);
}
