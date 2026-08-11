import assert from "node:assert/strict";
import test from "node:test";

test("package root and subpath exports resolve", async () => {
  const root = await import("@workspace/shared");
  const auth = await import("@workspace/shared/auth");
  const audit = await import("@workspace/shared/audit");
  const http = await import("@workspace/shared/http");
  const logger = await import("@workspace/shared/logger");
  const schemas = await import("@workspace/shared/schemas");
  const security = await import("@workspace/shared/security");

  assert.equal(root.ServiceError, http.ServiceError);
  assert.equal(root.parseWithZod, schemas.parseWithZod);
  assert.equal(root.authenticateFromAuthHeader, auth.authenticateFromAuthHeader);
  assert.equal(root.createAuditRecorder, audit.createAuditRecorder);
  assert.equal(root.createLogger, logger.createLogger);
  assert.equal(root.EncryptionService, security.EncryptionService);
  assert.equal(root.createEncryptedTextCrypto, security.createEncryptedTextCrypto);
});
