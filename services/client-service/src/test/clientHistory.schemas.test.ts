import { describe, expect, it } from "vitest";
import {
  createHistoryBodySchema,
  updateHistoryBodySchema,
} from "../schemas/clientVerticals.schemas.js";

const SCHEMAS = { create: createHistoryBodySchema, update: updateHistoryBodySchema };

describe("history date contract", () => {
  it.each(Object.entries(SCHEMAS))("%s accepts ISO datetimes with offset", (_name, schema) => {
    for (const date of ["2026-09-23T13:00:00.000Z", "2026-09-23T10:00:00-03:00"]) {
      const parsed = schema.parse({ date, history: "Contato" });
      expect(parsed.date.toISOString()).toBe("2026-09-23T13:00:00.000Z");
    }
  });

  it.each(Object.entries(SCHEMAS))("%s rejects datetimes without offset", (_name, schema) => {
    for (const date of ["2026-09-23T10:00", "2026-09-23T10:00:00", "2026-09-23"]) {
      const result = schema.safeParse({ date, history: "Contato" });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.message).toBe(
        "Informe data e hora com fuso horário (ISO 8601).",
      );
    }
  });
});
