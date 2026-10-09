/** Pedidos de nota colados pela equipe: um por linha ou separados por vírgula. */
export function parseNoteRequests(text: string): string[] {
  return text
    .split(/[\n,]+/u)
    .map((item) => item.trim())
    .filter(Boolean);
}

/** Conteúdo do arquivo em base64, em blocos para não estourar a pilha com arquivos grandes. */
export async function fileToBase64(file: Blob): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}
