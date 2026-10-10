import { utils, write } from "@e965/xlsx";

/** XLSX sintético: cada item é uma linha a partir de `origin`; em A1, a coluna C é o terceiro valor. */
export function veriWorkbook(
  rows: readonly (readonly (string | number)[])[],
  origin = "A1",
): Buffer {
  const book = utils.book_new();
  const sheet = utils.aoa_to_sheet(
    rows.map((row) => [...row]),
    { origin },
  );
  utils.book_append_sheet(book, sheet, "Clientes");
  return write(book, { type: "buffer", bookType: "xlsx", compression: true }) as Buffer;
}
