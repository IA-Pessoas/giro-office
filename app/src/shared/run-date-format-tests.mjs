import assert from "node:assert/strict";

import { formatCivilDate, formatDateTime, formatTime } from "./utils/dateFormat.ts";

// Datas civis não passam por fuso: o mesmo resultado em Brasília (UTC-3), Manaus (UTC-4) e no
// navegador en-US em Nova York que apontou o bug (#1366).
for (const timeZone of ["America/Sao_Paulo", "America/Manaus", "America/New_York", "UTC"]) {
  process.env.TZ = timeZone;

  assert.equal(formatCivilDate("2026-12-31"), "31/12/2026", timeZone);
  // A API manda o vencimento como meia-noite UTC; em UTC-3 isso virava 30/12.
  assert.equal(formatCivilDate("2026-12-31T00:00:00.000Z"), "31/12/2026", timeZone);
  assert.equal(formatCivilDate("2026-01-01T00:00:00.000Z"), "01/01/2026", timeZone);
  assert.equal(formatCivilDate(null), "", timeZone);
  assert.equal(formatCivilDate("sem data", "Não informado"), "Não informado", timeZone);
  assert.equal(formatCivilDate("", "Não informado"), "Não informado", timeZone);
}

// Instantes (histórico, mensagens) seguem o fuso do navegador, sempre em pt-BR e 24h.
const instant = "2026-09-23T18:05:00.000Z";

process.env.TZ = "America/Sao_Paulo";
assert.equal(formatDateTime(instant), "23/09/2026 15:05");
assert.equal(formatTime(instant), "15:05");

process.env.TZ = "America/Manaus";
assert.equal(formatDateTime(instant), "23/09/2026 14:05");
assert.equal(formatTime(instant), "14:05");

process.env.TZ = "America/New_York";
assert.equal(formatDateTime(instant), "23/09/2026 14:05");
assert.equal(formatTime("2026-09-23T03:07:00.000Z"), "23:07");
assert.equal(formatDateTime("inválido", "—"), "—");
assert.equal(formatTime(null), "");

console.log("PASS date format: pt-BR, 24h e datas civis sem deslocamento em UTC-3 e UTC-4");
