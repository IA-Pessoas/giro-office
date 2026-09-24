import { describe, expect, it, vi } from "vitest";
import { routeSourceFetch } from "./sourceFetch.js";

describe("routeSourceFetch", () => {
  it("entrega a URL de binding ao Service Binding do serviço", async () => {
    const task = { fetch: vi.fn(async () => new Response("task")) };
    const base = vi.fn(async () => new Response("rede"));
    const fetch = routeSourceFetch({ TASK_SERVICE: task } as never, base);

    const response = await fetch(
      new URL("/internal/reporting/extract", "https://task-service.binding"),
      { method: "POST", body: "{}" },
    );

    expect(await response.text()).toBe("task");
    expect(base).not.toHaveBeenCalled();
    const [input, init] = task.fetch.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(input)).toBe("https://task-service.binding/internal/reporting/extract");
    expect(init.method).toBe("POST");
  });

  it("deixa qualquer outra URL seguir para a rede", async () => {
    const base = vi.fn(async () => new Response("rede"));
    const fetch = routeSourceFetch({} as never, base);

    expect(await (await fetch("https://api.example.com/x")).text()).toBe("rede");
  });

  it("falha alto quando o binding da origem não está configurado", async () => {
    const fetch = routeSourceFetch({} as never, vi.fn());

    await expect(fetch("https://rh-service.binding/internal/reporting/extract")).rejects.toThrow(
      /RH_SERVICE/,
    );
  });
});
