import { describe, expect, it } from "vitest";

import { renderTimeSheetPdf } from "../services/timeSheetPdfService.js";

describe("timeSheetPdfService", () => {
  it("gera um PDF com período, totais, marcações e assinatura", async () => {
    const pdf = await renderTimeSheetPdf({
      employeeName: "Ana Silva",
      periodStart: new Date("2026-04-22T00:00:00.000Z"),
      periodEnd: new Date("2026-05-22T23:59:59.999Z"),
      status: "Assinada",
      days: [
        {
          date: "2026-05-18",
          clock_in: "2026-05-18T08:00:00.000Z",
          lunch_out: "2026-05-18T12:00:00.000Z",
          lunch_in: "2026-05-18T13:00:00.000Z",
          clock_out: "2026-05-18T17:00:00.000Z",
          worked_minutes: 480,
          expected_minutes: 480,
          balance_minutes: 0,
          status: "Completo",
        },
      ],
      totals: {
        worked_minutes: 480,
        expected_minutes: 480,
        balance_minutes: 0,
        absence_count: 0,
        bank_balance_minutes: 30,
      },
      signature: "Ana Silva",
    });

    expect(pdf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(500);
  });
});
