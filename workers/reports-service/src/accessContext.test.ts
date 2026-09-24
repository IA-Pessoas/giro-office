import { afterEach, describe, expect, it, vi } from "vitest";
import { accessContextClient } from "./app.js";

const auth = { organizationId: "org-1", claims: { type: "user", modules: { rh: 1 } } };
const context = (env: Record<string, unknown>) =>
  ({ env, get: () => auth }) as unknown as Parameters<typeof accessContextClient>[0];
const input = { userId: "user-1", organizationId: "org-1", requestId: "req-1" };
const binding = { USER_SERVICE: { fetch: vi.fn() }, REPORTS_INTERNAL_TOKEN: "reports-token" };

afterEach(() => vi.unstubAllGlobals());

describe("contexto de acesso do reports-service", () => {
  it("consulta o user-service pelo binding quando não há USER_SERVICE_URL (produção)", async () => {
    const department = { id: "dep-1", name: "Tecnologia" };
    const fetch = vi.fn(async () => Response.json({ success: true, data: { department } }));
    vi.stubGlobal("fetch", fetch);

    const result = await accessContextClient(context(binding), {}).getAccessContext(input);

    expect(result).toMatchObject({ department });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/internal/reporting/access-context");
    expect(new Headers(init.headers).get("x-internal-service-token")).toBe("reports-token");
  });

  it("volta aos claims do token se o user-service falhar", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ success: false }, { status: 403 })),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await accessContextClient(context(binding), {}).getAccessContext(input);

    expect(result).toMatchObject({ department: null, type: "user", modules: { rh: 1 } });
  });

  it("sem binding nem URL usa os claims sem chamar a rede", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    const result = await accessContextClient(context({}), {}).getAccessContext(input);

    expect(result).toMatchObject({ department: null, type: "user" });
    expect(fetch).not.toHaveBeenCalled();
  });
});
