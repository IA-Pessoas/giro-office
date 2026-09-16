import assert from "node:assert/strict";
import { test } from "node:test";

import { formatReportDate, formatReportDateTime } from "../utils/reportDateTime.js";

test("converte datas do relatório para a data local de São Paulo", () => {
  assert.equal(formatReportDate(new Date("2026-01-01T02:30:00.000Z")), "31/12/2025");
});

test("converte a hora de criação para o fuso de São Paulo", () => {
  assert.equal(
    formatReportDateTime(new Date("2026-09-14T15:45:00.000Z")),
    "14/09/2026 12:45",
  );
});

test("mantém a data local correta na virada do dia", () => {
  assert.equal(
    formatReportDateTime(new Date("2026-01-01T02:30:00.000Z")),
    "31/12/2025 23:30",
  );
});
