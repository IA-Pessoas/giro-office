import assert from "node:assert/strict";
import test from "node:test";

import { createEncryptedTextCrypto } from "../../src/security/index.js";

const encryptionKey = Buffer.alloc(32, 7).toString("base64");

test("createEncryptedTextCrypto produces a versioned AES-256-GCM envelope and round-trips text", () => {
  const service = createEncryptedTextCrypto({
    keyBase64: encryptionKey,
    keyVersion: "v1",
  });

  const encrypted = service.encrypt("certificate-secret");
  const envelope = JSON.parse(encrypted) as Record<string, string>;

  assert.deepEqual(Object.keys(envelope), ["v", "iv", "tag", "data"]);
  assert.equal(envelope.v, "v1");
  assert.equal(Buffer.from(envelope.iv, "base64").length, 12);
  assert.equal(Buffer.from(envelope.tag, "base64").length, 16);
  assert.equal(service.decrypt(encrypted), "certificate-secret");
  assert.equal(service.isEncrypted(encrypted), true);
});

test("createEncryptedTextCrypto detects plaintext and malformed envelopes", () => {
  const service = createEncryptedTextCrypto({
    keyBase64: encryptionKey,
    keyVersion: "v1",
  });

  assert.equal(service.isEncrypted("certificate-secret"), false);
  assert.equal(service.isEncrypted('{"v":"v1","iv":"broken"}'), false);
  assert.throws(() => service.decrypt("certificate-secret"), /encrypted text envelope/i);
});

test("createEncryptedTextCrypto rejects invalid keys and incompatible versions", () => {
  assert.throws(
    () =>
      createEncryptedTextCrypto({
        keyBase64: "invalid-key",
        keyVersion: "v1",
      }),
    /32 bytes/i,
  );

  const writer = createEncryptedTextCrypto({
    keyBase64: encryptionKey,
    keyVersion: "v1",
  });
  const reader = createEncryptedTextCrypto({
    keyBase64: encryptionKey,
    keyVersion: "v2",
  });

  assert.throws(() => reader.decrypt(writer.encrypt("certificate-secret")), /version/i);
});
