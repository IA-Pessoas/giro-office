import { utils, write } from "@e965/xlsx";

/** XLSX sintético: cada item é uma linha, a partir da linha 1; a coluna C é o terceiro valor. */
export function veriWorkbook(rows: readonly (readonly (string | number)[])[]): Buffer {
  const book = utils.book_new();
  utils.book_append_sheet(book, utils.aoa_to_sheet(rows.map((row) => [...row])), "Clientes");
  return write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
