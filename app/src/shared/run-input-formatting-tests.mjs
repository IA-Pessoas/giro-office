import assert from "node:assert/strict";

import {
  formatBrazilianPhoneInput,
  formatBrlInput,
  formatCnpjInput,
  formatCpfCnpjInput,
  formatCpfInput,
  normalizeDigits,
  parseBrlInput,
} from "./utils/inputFormatting.ts";

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

assert.equal(formatBrlInput("123456"), "R$ 1.234,56");
assert.equal(formatBrlInput("R$ 12,34"), "R$ 12,34");
assert.equal(formatBrlInput(""), "");
assert.equal(formatBrlInput("valor inválido"), "valor inválido");
assert.equal(formatBrlInput("9007199254740992"), "9007199254740992");
assert.equal(parseBrlInput("R$ 1.234,56"), 1234.56);
assert.equal(parseBrlInput(""), null);
assert.equal(parseBrlInput("R$ 12,34"), 12.34);
assert.equal(parseBrlInput("9007199254740992"), null);

console.log("input formatting tests passed");
