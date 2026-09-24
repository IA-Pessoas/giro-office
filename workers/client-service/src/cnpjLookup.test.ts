import { describe, expect, it } from "vitest";
import { lookupOfficialCnpj } from "./cnpjLookup.js";

describe("lookupOfficialCnpj", () => {
  it("uses the public fallback while the official provider is not configured", async () => {
    let seen: string | undefined;
    const fetchImpl = (async (url: string) => {
      seen = url;
      return Response.json({
        razao_social: "Banco do Brasil SA",
        nome_fantasia: "Direcao Geral",
        data_inicio_atividade: "1966-08-01",
        logradouro: "Q SAUN QUADRA 5",
        cep: "70040912",
        bairro: "Asa Norte",
        uf: "DF",
        municipio: "BRASILIA",
      });
    }) as typeof fetch;

    const result = await lookupOfficialCnpj("00000000000191", undefined, undefined, fetchImpl);

    expect(seen).toBe("https://brasilapi.com.br/api/cnpj/v1/00000000000191");
    expect(result).toMatchObject({
      company_name: "Banco do Brasil SA",
      opening_date: "1966-08-01",
      address: "Q SAUN QUADRA 5",
      state: "DF",
      city: "BRASILIA",
    });
  });

  it("falls back to the public provider when the official one fails (HTTP 530)", async () => {
    const urls: string[] = [];
    const fetchImpl = (async (url: string) => {
      urls.push(url);
      if (url.startsWith("https://cnpj.example")) return new Response("", { status: 530 });
      return Response.json({ razao_social: "Acme Ltda" });
    }) as typeof fetch;

    const result = await lookupOfficialCnpj(
      "12345678000195",
      "https://cnpj.example",
      "secret",
      fetchImpl,
    );

    expect(urls).toHaveLength(2);
    expect(result).toMatchObject({ company_name: "Acme Ltda" });
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

  it("answers a friendly 502 without internal status when every provider fails", async () => {
    const failing = (async () => new Response("", { status: 530 })) as typeof fetch;
    const error = await lookupOfficialCnpj(
      "12345678000195",
      "https://cnpj.example",
      "secret",
      failing,
    ).catch((caught: unknown) => caught);
    expect(error).toMatchObject({ statusCode: 502 });
    expect((error as Error).message).not.toMatch(/HTTP|\d{3}/u);
  });

  it("answers 404 when the CNPJ does not exist", async () => {
    const missing = (async () => new Response("", { status: 404 })) as typeof fetch;
    await expect(
      lookupOfficialCnpj("12345678000195", "https://cnpj.example", "secret", missing),
    ).rejects.toMatchObject({ statusCode: 404, message: "CNPJ não encontrado na base oficial." });
  });
});
