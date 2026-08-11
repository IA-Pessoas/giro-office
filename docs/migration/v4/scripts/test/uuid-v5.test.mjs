import assert from "node:assert/strict";
import test from "node:test";

import { uuidV5 } from "../lib/uuid-v5.mjs";

const NAMESPACE = "3f68d246-0b54-4a10-9415-a8845a767fb5";

test("uuidV5 e deterministico para a mesma identidade legado", () => {
  const name = "tb_admin.usuarios:42";

  assert.equal(uuidV5(NAMESPACE, name), uuidV5(NAMESPACE, name));
});

test("uuidV5 separa identidades de tabelas e IDs distintos", () => {
  const current = uuidV5(NAMESPACE, "tb_admin.usuarios:42");

  assert.notEqual(current, uuidV5(NAMESPACE, "tb_rh.colaboradores:42"));
  assert.notEqual(current, uuidV5(NAMESPACE, "tb_admin.usuarios:43"));
});

test("uuidV5 produz UUID versao 5 com variant RFC 4122", () => {
  const value = uuidV5(NAMESPACE, "tb_admin.usuarios:42");

  assert.match(value, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test("uuidV5 rejeita namespace malformado", () => {
  assert.throws(() => uuidV5("namespace-invalido", "tb_admin.usuarios:42"), /namespace/i);
});
