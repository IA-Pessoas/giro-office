import { describe, expect, it } from "vitest";

import { isValidCnpj, normalizeCnpj } from "../domain/cnpj.js";

describe("CNPJ", () => {
  // Break: a máscara de um CNPJ válido deixa de ser removida antes da persistência.
  it("normaliza um CNPJ formatado para 14 dígitos", () => {
    expect(normalizeCnpj("11.222.333/0001-81")).toBe("11222333000181");
  });

  // Break: um CNPJ com menos de 14 dígitos passa pela validação.
  it("rejeita CNPJ com quantidade inválida de dígitos", () => {
    expect(isValidCnpj("1122233300018")).toBe(false);
  });

  // Break: um valor composto pelo mesmo dígito é aceito como CNPJ real.
  it("rejeita CNPJ com todos os dígitos repetidos", () => {
    expect(isValidCnpj("11111111111111")).toBe(false);
  });

  // Break: o cálculo dos dígitos verificadores deixa de detectar adulteração.
  it("rejeita CNPJ com dígito verificador inválido", () => {
    expect(isValidCnpj("11222333000182")).toBe(false);
  });

  // Break: letras inseridas em um CNPJ válido são descartadas e o valor acaba aceito.
  it("rejeita caracteres fora da máscara oficial", () => {
    expect(isValidCnpj("A11.222.333/0001-81")).toBe(false);
  });

  // Break: pontuação excedente ou mal posicionada é removida e um CNPJ inválido acaba aceito.
  it("rejeita máscara malformada mesmo quando os 14 dígitos são válidos", () => {
    expect(isValidCnpj("11.222.333/0001-81.")).toBe(false);
    expect(isValidCnpj("....11222333000181----")).toBe(false);
  });

  // Break: o cálculo dos dígitos verificadores rejeita um CNPJ válido conhecido.
  it("aceita CNPJ com dígitos verificadores válidos", () => {
    expect(isValidCnpj("11222333000181")).toBe(true);
  });
});
