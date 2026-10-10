import { utils, write } from "@e965/xlsx";

export function contingencyRows(): (string | number)[][] {
  const rows: (string | number)[][] = [["CNPJ: 11.222.333/0001-81"]];
  for (const [column, label, valueColumn, value] of [
    [8, "RECEITA BRUTA DE VENDAS E SERVIÇOS", 20, "100.000,00"],
    [9, "BANCOS CONTA MOVIMENTO", 18, 180000],
    [9, "DUPLICATAS A RECEBER", 20, 120000],
    [9, "EMPRESTIMOS DE TERCEIROS", 20, 20000],
    [9, "ADIANTAMENTO A SÓCIOS", 20, 5000],
    [10, "CAIXA GERAL", 20, 3000],
    [9, "EMPRÉSTIMOS", 20, 10000],
  ] as const) {
    const row: (string | number)[] = Array(21).fill("");
    row[column] = label;
    row[valueColumn] = value;
    rows.push(row);
  }
  return rows;
}

export function contingencyXls(rows = contingencyRows()): Buffer {
  const book = utils.book_new();
  utils.book_append_sheet(book, utils.aoa_to_sheet(rows), "Balancete");
  return write(book, { type: "buffer", bookType: "biff8" });
}
