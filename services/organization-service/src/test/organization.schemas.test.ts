import { describe, expect, it } from "vitest";

import {
  createOrganizationBodySchema,
  createPlatformOrganizationBodySchema,
  platformOrganizationIdParamsSchema,
  updatePlatformOrganizationLogoUrlBodySchema,
  updatePlatformOrganizationStatusBodySchema,
  updatePlatformOrganizationSubscriptionPlanBodySchema,
} from "../schemas/organization.schemas.js";

const expectedUpdatedAt = "2026-08-25T12:00:00.000Z";

describe.each([
  ["legacy", createOrganizationBodySchema, { email_created_by: "admin@example.com" }],
  ["platform", createPlatformOrganizationBodySchema, {}],
] as const)("CNPJ na criação %s", (_writer, schema, extra) => {
  it.each(["11222333000181", "11.222.333/0001-81"])("normaliza entrada válida %s", (cnpj) => {
    expect(schema.parse({ name: "Empresa Teste", cnpj, ...extra }).cnpj).toBe("11222333000181");
  });

  it.each([
    "11.222.333/0001-82",
    "11222333000182",
    "11-222-333/0001.81",
    "11111111111111",
  ])("rejeita dígitos ou máscara inválida %s", (cnpj) => {
    expect(schema.safeParse({ name: "Empresa Teste", cnpj, ...extra }).success).toBe(false);
  });
});

describe("platform organization schemas", () => {
  // Break: a criação volta a persistir a máscara do CNPJ recebido.
  it("normaliza o CNPJ válido na criação", () => {
    expect(
      createPlatformOrganizationBodySchema.parse({
        name: "Castelo",
        cnpj: "11.222.333/0001-81",
      }),
    ).toEqual({ name: "Castelo", cnpj: "11222333000181" });
  });

  // Break: campos controlados pelo servidor podem ser injetados no cadastro.
  it("rejeita campos extras na criação", () => {
    const result = createPlatformOrganizationBodySchema.safeParse({
      name: "Castelo",
      cnpj: "11.222.333/0001-81",
      email_created_by: "forged@example.com",
    });

    expect(result.success).toBe(false);
  });

  // Break: um CNPJ com dígitos verificadores inválidos chega ao service.
  it("rejeita CNPJ inválido na criação", () => {
    const result = createPlatformOrganizationBodySchema.safeParse({
      name: "Castelo",
      cnpj: "11.222.333/0001-82",
    });

    expect(result.success).toBe(false);
  });

  // Break: o identificador deixa de exigir UUID antes da consulta.
  it("rejeita parâmetro de organização que não seja UUID", () => {
    expect(platformOrganizationIdParamsSchema.safeParse({ id: "org-1" }).success).toBe(false);
  });

  // Break: uma alteração de status deixa de exigir a versão observada pelo cliente.
  it("exige expected_updated_at ISO na alteração de status", () => {
    expect(
      updatePlatformOrganizationStatusBodySchema.safeParse({ status: "suspended" }).success,
    ).toBe(false);
    expect(
      updatePlatformOrganizationStatusBodySchema.safeParse({
        status: "suspended",
        expected_updated_at: "25/08/2026",
      }).success,
    ).toBe(false);
  });

  // Break: um status fora do ciclo de vida conhecido passa pela API.
  it("aceita somente status de organização suportados", () => {
    expect(
      updatePlatformOrganizationStatusBodySchema.safeParse({
        status: "deleted",
        expected_updated_at: expectedUpdatedAt,
      }).success,
    ).toBe(false);
    expect(
      updatePlatformOrganizationStatusBodySchema.safeParse({
        status: "trial",
        expected_updated_at: expectedUpdatedAt,
      }).success,
    ).toBe(true);
  });

  // Break: um plano arbitrário passa a ser gravado como assinatura.
  it("aceita somente planos do catálogo fechado", () => {
    expect(
      updatePlatformOrganizationSubscriptionPlanBodySchema.safeParse({
        subscription_plan: "custom",
        expected_updated_at: expectedUpdatedAt,
      }).success,
    ).toBe(false);
    expect(
      updatePlatformOrganizationSubscriptionPlanBodySchema.safeParse({
        subscription_plan: "enterprise",
        expected_updated_at: expectedUpdatedAt,
      }).success,
    ).toBe(true);
  });

  // Break: a logo aceita protocolo inseguro ou credenciais embutidas.
  it("aceita apenas URL HTTPS sem credenciais", () => {
    expect(
      updatePlatformOrganizationLogoUrlBodySchema.safeParse({
        logo_url: "http://cdn.example.com/logo.png",
        expected_updated_at: expectedUpdatedAt,
      }).success,
    ).toBe(false);
    expect(
      updatePlatformOrganizationLogoUrlBodySchema.safeParse({
        logo_url: "https://user:password@cdn.example.com/logo.png",
        expected_updated_at: expectedUpdatedAt,
      }).success,
    ).toBe(false);
    expect(
      updatePlatformOrganizationLogoUrlBodySchema.safeParse({
        logo_url: "https://cdn.example.com/logo.png",
        expected_updated_at: expectedUpdatedAt,
      }).success,
    ).toBe(true);
  });

  // Break: uma URL maior que o limite operacional passa pela validação.
  it("rejeita URL de logo acima de 2.048 caracteres", () => {
    const prefix = "https://cdn.example.com/";
    const logoUrl = `${prefix}${"a".repeat(2_049 - prefix.length)}`;

    expect(
      updatePlatformOrganizationLogoUrlBodySchema.safeParse({
        logo_url: logoUrl,
        expected_updated_at: expectedUpdatedAt,
      }).success,
    ).toBe(false);
  });

  // Break: limpar a logo deixa de ser uma operação válida e concorrente.
  it("aceita null para limpar a logo com expected_updated_at", () => {
    expect(
      updatePlatformOrganizationLogoUrlBodySchema.parse({
        logo_url: null,
        expected_updated_at: expectedUpdatedAt,
      }),
    ).toEqual({ logo_url: null, expected_updated_at: expectedUpdatedAt });
  });
});
