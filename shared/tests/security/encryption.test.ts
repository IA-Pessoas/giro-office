import assert from "node:assert/strict";
import test from "node:test";

import { EncryptionService } from "@workspace/shared";

const encryptionKey = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";

test("EncryptionService encrypts and decrypts values", () => {
  const service = new EncryptionService(encryptionKey);
  const encrypted = service.encrypt("super-secret");

  assert.notEqual(encrypted, "super-secret");
  assert.equal(service.decrypt(encrypted), "super-secret");
});

test("EncryptionService rejects invalid keys", () => {
  assert.throws(() => new EncryptionService("invalid-key"), /MTK_ENCRYPTION_KEY inválida/);
});

test("EncryptionService rejects invalid payloads", () => {
  const service = new EncryptionService(encryptionKey);

  assert.throws(() => service.decrypt("invalid-payload"), /Hash de descriptografia inválido/);
});
