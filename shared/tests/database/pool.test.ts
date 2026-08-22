import assert from "node:assert/strict";
import test from "node:test";

import {
  parseDatabasePoolConnectionTimeoutMs,
  parseDatabasePoolMax,
} from "../../src/database/pool.js";

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

test("parseDatabasePoolConnectionTimeoutMs usa cinco segundos por padrao", () => {
  assert.equal(parseDatabasePoolConnectionTimeoutMs(undefined), 5_000);
});

test("parseDatabasePoolConnectionTimeoutMs aceita inteiro positivo explicito", () => {
  assert.equal(parseDatabasePoolConnectionTimeoutMs("2500"), 2_500);
});

test("parseDatabasePoolConnectionTimeoutMs rejeita valores invalidos", () => {
  for (const value of ["", "0", "-1", "1.5", "invalid"]) {
    assert.throws(
      () => parseDatabasePoolConnectionTimeoutMs(value),
      /DATABASE_POOL_CONNECTION_TIMEOUT_MS/u,
    );
  }
});
