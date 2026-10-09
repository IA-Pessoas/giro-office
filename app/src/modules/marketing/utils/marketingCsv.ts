import type { MarketingStock, MarketingStockItem } from "../types/marketingDashboard";

export interface BirthdayCsvItem {
  name: string;
  day: number;
}

type BirthdayRow = [string, string, string];

function csvCell(value: string | number): string {
  const text = String(value);
  const safeText = /^[\s]*[=+\-@]/u.test(text) ? `'${text}` : text;
  return `"${safeText.replaceAll('"', '""')}"`;
}

function createCsv(rows: readonly (readonly (string | number)[])[]): string {
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}

export function createBirthdayCsv(items: readonly BirthdayCsvItem[]): string {
  return createCsv([["Nome", "Dia"], ...items.map((item) => [item.name, item.day])]);
}

export function downloadCsvFile(filename: string, csv: string): void {
  const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** `1990-05-31` → `31/05/1990`, como o relatório legado. */
export function formatBirthDate(birthDate: string): string {
  const [year, month, day] = birthDate.split("-");
  return `${day}/${month}/${year}`;
}

// Tela, impressão e CSV usam as mesmas colunas e linhas.
export const EMPLOYEE_BIRTHDAY_COLUMNS: BirthdayRow = ["Data", "Colaborador", "Departamento"];
export const CLIENT_BIRTHDAY_COLUMNS: BirthdayRow = ["Data", "Cliente", "Empresa"];

export function employeeBirthdayRows(
  items: readonly { name: string; birthDate: string; department: string | null }[],
): BirthdayRow[] {
  return items.map((item) => [
    formatBirthDate(item.birthDate),
    item.name,
    item.department ?? "Sem departamento",
  ]);
}

export function clientBirthdayRows(
  items: readonly { name: string; birthDate: string; companies: string }[],
): BirthdayRow[] {
  return items.map((item) => [formatBirthDate(item.birthDate), item.name, item.companies]);
}

export function createMonthlyEmployeeBirthdayCsv(
  items: Parameters<typeof employeeBirthdayRows>[0],
): string {
  return createCsv([EMPLOYEE_BIRTHDAY_COLUMNS, ...employeeBirthdayRows(items)]);
}

export function createMonthlyClientBirthdayCsv(
  items: Parameters<typeof clientBirthdayRows>[0],
): string {
  return createCsv([CLIENT_BIRTHDAY_COLUMNS, ...clientBirthdayRows(items)]);
}

// Tela, impressão e CSV usam as mesmas colunas e linhas.
export const MARKETING_STOCK_COLUMNS = ["Nome", "Quantidade", "Última entrada", "Última saída"];

function formatMovement(value: string | null, timeZone?: string): string {
  if (!value) return "Sem registro";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone,
  }).format(new Date(value));
}

export function marketingStockRows(
  items: readonly MarketingStockItem[],
  timeZone?: string,
): string[][] {
  return items.map((item) => [
    item.name,
    String(item.quantity),
    formatMovement(item.lastEntryAt, timeZone),
    formatMovement(item.lastExitAt, timeZone),
  ]);
}

function itemCountLabel(count: number): string {
  return `${count} ${count === 1 ? "item" : "itens"}`;
}

export function marketingStockTotalsLabel(totals: MarketingStock["totals"]): string {
  const units = `${totals.quantity} ${totals.quantity === 1 ? "unidade" : "unidades"}`;
  return `${itemCountLabel(totals.items)} · ${units} em estoque`;
}

/** A última linha repete os totais exibidos na tela e na impressão. */
export function createMarketingStockCsv(
  stock: Pick<MarketingStock, "items" | "totals">,
  timeZone?: string,
): string {
  return createCsv([
    MARKETING_STOCK_COLUMNS,
    ...marketingStockRows(stock.items, timeZone),
    [`Total: ${itemCountLabel(stock.totals.items)}`, String(stock.totals.quantity), "", ""],
  ]);
}
