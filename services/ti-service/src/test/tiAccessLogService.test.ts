import "./envBootstrap.js";

import { describe, expect, it, vi } from "vitest";

import { listTiAccessLogs } from "../services/tiAccessLogService.js";

const context = { organizationId: "10000000-0000-4000-8000-000000000001" };
const userId = "00000000-0000-4000-8000-000000000001";
const user = { id: userId, name: "Ana", full_name: "Ana Souza" };

function database(results: unknown[][]) {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const $queryRaw = vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    calls.push({ sql: strings.join("?"), values });
    return results[calls.length - 1] ?? [];
  });
  return { $queryRaw, calls };
}

describe("listTiAccessLogs", () => {
  it("rejects a user from another organization before reading any log", async () => {
    const db = database([[]]);

    await expect(listTiAccessLogs(db, context, userId, {})).rejects.toMatchObject({
      statusCode: 404,
    });

    expect(db.calls).toHaveLength(1);
    expect(db.calls[0]?.sql).toContain('"users"');
    expect(db.calls[0]?.values).toEqual([userId, context.organizationId]);
  });

  it("lists logins and accesses newest first, scoped by organization and user", async () => {
    const db = database([
      [user],
      [
        {
          id: "l2",
          type: "1",
          referring: "Acesso Tecnologia",
          referring_id: "0",
          date: new Date("2025-01-02T12:00:00.000Z"),
        },
        {
          id: "l1",
          type: "0",
          referring: "Login Tecnologia",
          referring_id: "0",
          date: new Date("2025-01-01T12:00:00.000Z"),
        },
      ],
    ]);

    const result = await listTiAccessLogs(db, context, userId, {});

    expect(result).toEqual({
      user,
      has_more: false,
      items: [
        {
          id: "l2",
          type: "access",
          referring: "Acesso Tecnologia",
          referring_id: "0",
          date: new Date("2025-01-02T12:00:00.000Z"),
          origin: null,
        },
        {
          id: "l1",
          type: "login",
          referring: "Login Tecnologia",
          referring_id: "0",
          date: new Date("2025-01-01T12:00:00.000Z"),
          origin: null,
        },
      ],
    });

    const sql = db.calls[1]?.sql ?? "";
    expect(sql).toMatch(/ORDER BY date DESC, id DESC/);
    // Só eventos legados de login (0) e acesso (1); alterações de entidade ficam fora.
    expect(sql).toContain("action IN (?, ?)");
    expect(db.calls[1]?.values).toEqual([context.organizationId, userId, "0", "1", 51, 0]);
  });

  it("paginates and reports when there are older events", async () => {
    const row = (id: string) => ({
      id,
      type: "0",
      referring: "Login Tecnologia",
      referring_id: "0",
      date: new Date("2025-01-01T00:00:00.000Z"),
    });
    const db = database([[user], [row("a"), row("b"), row("c")]]);

    const result = await listTiAccessLogs(db, context, userId, { page: 3, page_size: 2 });

    expect(result.items.map((item) => item.id)).toEqual(["a", "b"]);
    expect(result.has_more).toBe(true);
    expect(db.calls[1]?.values.slice(-2)).toEqual([3, 4]);
  });

  it("stays apart from the credentials report “Logins” and from current sessions", async () => {
    const db = database([[user], []]);

    await listTiAccessLogs(db, context, userId, {});

    for (const call of db.calls) {
      expect(call.sql).not.toMatch(/password|auth_sessions/i);
    }
  });
});
