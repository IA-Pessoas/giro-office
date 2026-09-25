import assert from "node:assert/strict";

import {
  formatBrazilianPhoneInput,
  formatBrlAmount,
  formatBrlDecimalInput,
  formatBrlInput,
  formatCnpjInput,
  formatCpfCnpjInput,
  formatCpfInput,
  formatTimeInput,
  isValidCnpj,
  isValidTimeInput,
  normalizeDigits,
  parseBrlDecimalInput,
  parseBrlInput,
} from "./utils/inputFormatting.ts";
import { maskCPF } from "./utils/formatters.ts";

// #1344: listas mostram só os dígitos do meio do CPF.
assert.equal(maskCPF("11144477735"), "***.444.777-**");
assert.equal(maskCPF("111.444.777-35"), "***.444.777-**");
assert.equal(maskCPF("123"), "***");
assert.equal(maskCPF(null), "");

assert.equal(formatCpfInput("12345678901"), "123.456.789-01");
assert.equal(formatCpfInput("123456"), "123.456");
assert.equal(formatCpfInput("123.456.789-01999"), "123.456.789-01");

assert.equal(formatCnpjInput("12.345.678/0001-90"), "12.345.678/0001-90");
assert.equal(formatCnpjInput("12345678"), "12.345.678");
assert.equal(formatCnpjInput("12.345.678/0001-9000"), "12.345.678/0001-90");
assert.equal(formatCnpjInput("ab123456780001"), "AB.123.456/7800-01");

assert.equal(formatCpfCnpjInput("12345678901"), "123.456.789-01");
assert.equal(formatCpfCnpjInput("12345678901234"), "12.345.678/9012-34");
assert.equal(formatCpfCnpjInput("12345678000190"), "12.345.678/0001-90");

assert.equal(formatBrazilianPhoneInput("11987654321"), "(11) 98765-4321");
assert.equal(formatBrazilianPhoneInput("1132654321"), "(11) 3265-4321");
assert.equal(formatBrazilianPhoneInput("11987654"), "(11) 9876-54");
assert.equal(formatBrazilianPhoneInput("119876543"), "(11) 9876-543");
assert.equal(formatBrazilianPhoneInput("11987"), "(11) 987");
assert.equal(formatBrazilianPhoneInput("(11) 98765-432199"), "(11) 98765-4321");

assert.equal(normalizeDigits("12.345.678/0001-90"), "12345678000190");
assert.equal(normalizeDigits("R$ 12,34"), "1234");
assert.equal(normalizeDigits(null), "");
assert.equal(normalizeDigits(undefined), "");

// Máscara de moeda digitada em reais, com vírgula decimal (#1366): "100" é R$ 100, não R$ 1,00.
function typeInto(keys) {
  return [...keys].reduce((display, key) => formatBrlInput(display + key), "");
}
assert.equal(typeInto("150,50"), "R$ 150,50");
assert.equal(parseBrlInput(typeInto("150,50")), 150.5);
assert.equal(typeInto("150,5"), "R$ 150,5");
assert.equal(parseBrlInput(typeInto("150,5")), 150.5);
assert.equal(typeInto("100"), "R$ 100");
assert.equal(parseBrlInput(typeInto("100")), 100);
assert.equal(typeInto("1234567,8"), "R$ 1.234.567,8");
// Terceira casa decimal desloca o valor (mesma regra do campo pré-preenchido).
assert.equal(typeInto("150,555"), "R$ 1.505,55");
// Apagar um dígito de "R$ 1.234" não vira decimal: ponto é sempre milhar.
assert.equal(formatBrlInput("R$ 1.23"), "R$ 123");
assert.equal(formatBrlInput("R$ 1.234,56"), "R$ 1.234,56");
assert.equal(formatBrlInput(formatBrlInput("R$ 1.234,56")), "R$ 1.234,56");
assert.equal(formatBrlInput(",5"), "R$ 0,5");
assert.equal(formatBrlInput(""), "");
assert.equal(formatBrlInput("valor inválido"), "valor inválido");
assert.equal(parseBrlInput("R$ 1.234,56"), 1234.56);
assert.equal(parseBrlInput(""), null);
assert.equal(parseBrlInput("R$ 12,34"), 12.34);
assert.equal(parseBrlInput("9007199254740992"), null);
// Ponto decimal colado ("150.50") ou do teclado numérico no fim vira vírgula; no meio do nosso
// próprio "R$ 1.234" continua sendo milhar.
assert.equal(formatBrlInput("150.50"), "R$ 150,50");
assert.equal(formatBrlInput("150.5"), "R$ 150,5");
assert.equal(formatBrlInput("1.000"), "R$ 1.000");
assert.equal(formatBrlInput("R$ 150."), "R$ 150,");
assert.equal(typeInto("150.50"), "R$ 150,50");
assert.equal(parseBrlInput("150.50"), 150.5);
// Campo pré-preenchido ("R$ 0,00" ou valor carregado): o dígito digitado no fim desloca o
// valor como numa calculadora, em vez de ser descartado.
function typeAfter(initial, keys) {
  return [...keys].reduce((display, key) => formatBrlInput(display + key), initial);
}
assert.equal(typeAfter("R$ 0,00", "15050"), "R$ 150,50");
assert.equal(parseBrlInput(typeAfter("R$ 0,00", "15050")), 150.5);
assert.equal(typeAfter("R$ 1.234,50", "7"), "R$ 12.345,07");
assert.equal(formatBrlInput("R$ 0,005"), "R$ 0,05");
assert.equal(formatBrlAmount(1234.5), "R$ 1.234,50");
assert.equal(formatBrlAmount(0), "R$ 0,00");
assert.equal(parseBrlInput(formatBrlAmount(1234.5)), 1234.5);

console.log("input formatting tests passed");

// CNPJ com dígito verificador, inclusive o formato alfanumérico (exemplo oficial da Receita).
assert.equal(isValidCnpj("11.222.333/0001-81"), true);
assert.equal(isValidCnpj("11222333000181"), true);
assert.equal(isValidCnpj("12.ABC.345/01DE-35"), true);
assert.equal(isValidCnpj("11.222.333/0001-44"), false);
assert.equal(isValidCnpj("123"), false);
assert.equal(isValidCnpj("00.000.000/0000-00"), false);
assert.equal(isValidCnpj("12.ABC.345/01DE-3A"), false);

// Valor em reais digitado como decimal: "100" é R$ 100,00, não R$ 1,00.
assert.equal(parseBrlDecimalInput("100"), 100);
assert.equal(parseBrlDecimalInput("100,5"), 100.5);
assert.equal(parseBrlDecimalInput("1.234,56"), 1234.56);
assert.equal(parseBrlDecimalInput("R$ 1.234,56"), 1234.56);
assert.equal(parseBrlDecimalInput("1.000"), 1000);
assert.equal(parseBrlDecimalInput("10.5"), 10.5);
assert.equal(parseBrlDecimalInput(""), null);
assert.equal(parseBrlDecimalInput("R$"), null);
assert.equal(formatBrlDecimalInput("100"), "R$ 100,00");
assert.equal(formatBrlDecimalInput("1234,5"), "R$ 1.234,50");
assert.equal(formatBrlDecimalInput(formatBrlDecimalInput("100")), "R$ 100,00");
assert.equal(formatBrlDecimalInput(""), "");

// #1359: horário 24h digitado, sem depender do locale do navegador.
assert.equal(formatTimeInput("0800"), "08:00");
assert.equal(formatTimeInput("8"), "8");
assert.equal(formatTimeInput("173"), "17:3");
assert.equal(formatTimeInput("17:30:15"), "17:30");
assert.equal(isValidTimeInput("08:00"), true);
assert.equal(isValidTimeInput("23:59"), true);
assert.equal(isValidTimeInput("24:00"), false);
assert.equal(isValidTimeInput("8:00"), false);
