import assert from "node:assert/strict";
import test from "node:test";

import { parseDatabasePoolMax } from "../../src/database/pool.js";

test("parseDatabasePoolMax usa um slot por processo por padrao", () => {
  assert.equal(parseDatabasePoolMax(undefined), 1);
});

test("parseDatabasePoolMax aceita um inteiro positivo explicito", () => {
  assert.equal(parseDatabasePoolMax("3"), 3);
});

test("parseDatabasePoolMax rejeita valores que nao sejam inteiros positivos", () => {
  for (const value of ["", "0", "-1", "1.5", "invalid"]) {
    assert.throws(() => parseDatabasePoolMax(value), /DATABASE_POOL_MAX/u);
  }
});
