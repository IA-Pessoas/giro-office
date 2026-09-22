import { describe, expect, it } from "vitest";
import { lookupOfficialCnpj } from "./cnpjLookup.js";

describe("lookupOfficialCnpj", () => {
  it("answers 503 while the official provider is not configured", async () => {
    await expect(lookupOfficialCnpj("12345678000195", undefined, "token")).rejects.toMatchObject({
      statusCode: 503,
    });
  });

  it("calls the provider like the Node service and maps its answer", async () => {
    let seen: { url: string; authorization: string | null } | undefined;
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      seen = { url, authorization: new Headers(init?.headers).get("authorization") };
      return Response.json({
        data: {
          razao_social: "Acme Ltda",
          nome_fantasia: "Acme",
          endereco: { logradouro: "Rua A", uf: "BA", municipio: "Feira" },
        },
      });
    }) as typeof fetch;

    const result = await lookupOfficialCnpj(
      "12345678000195",
      "https://cnpj.example/v1/{cnpj}",
      "secret",
      fetchImpl,
    );

    expect(seen).toEqual({
      url: "https://cnpj.example/v1/12345678000195",
      authorization: "Bearer secret",
    });
    expect(result).toMatchObject({
      cnpj: "12345678000195",
      name: "Acme Ltda",
      company_name: "Acme Ltda",
      fantasy_name: "Acme",
      address: "Rua A",
      state: "BA",
      city: "Feira",
    });
  });

  it("answers 502 when the provider fails", async () => {
    const failing = (async () => new Response("", { status: 500 })) as typeof fetch;
    await expect(
      lookupOfficialCnpj("12345678000195", "https://cnpj.example", "secret", failing),
    ).rejects.toMatchObject({ statusCode: 502 });
  });
});
