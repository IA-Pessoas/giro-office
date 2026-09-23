import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import {
  assertTargetAllowed,
  canonicalJson,
  csrfPair,
  isLoopback,
  looksProduction,
  parsePostgresTarget,
  sha256Hex,
  signJwt,
  signReportingGrant,
} from "./lib.mjs";

const LOCAL_DSN = "postgresql://postgres:x@127.0.0.1:5432/giro_smoke";

test("canonicalJson ordena chaves de forma estável", () => {
  assert.equal(canonicalJson({ b: 1, a: [2, { d: 4, c: 3 }] }), '{"a":[2,{"c":3,"d":4}],"b":1}');
  assert.equal(canonicalJson({}), "{}");
});

test("signJwt produz HS256 verificável", () => {
  const token = signJwt({ user_id: "u" }, "segredo");
  const [header, payload, signature] = token.split(".");
  assert.equal(JSON.parse(Buffer.from(header, "base64url").toString()).alg, "HS256");
  assert.equal(JSON.parse(Buffer.from(payload, "base64url").toString()).user_id, "u");
  assert.equal(
    signature,
    createHmac("sha256", "segredo").update(`${header}.${payload}`).digest("base64url"),
  );
});

test("csrfPair segue o formato exigido pelo runtime", () => {
  const { token, hash } = csrfPair();
  assert.match(token, /^[A-Za-z0-9_-]{43}$/u);
  assert.match(hash, /^[a-f0-9]{64}$/u);
  assert.equal(hash, sha256Hex(token));
});

test("signReportingGrant devolve grant canônico e assinatura HMAC", () => {
  const { grant, signature } = signReportingGrant({
    audience: "fiscal-service",
    operation: "catalog",
    source: "fiscal.catalog",
    organizationId: "00000000-0000-4000-8000-000000000000",
    fields: [],
    requestId: "req-1",
    body: {},
    secret: "grant-secret",
  });
  const payload = JSON.parse(Buffer.from(grant, "base64url").toString());
  assert.equal(Buffer.from(canonicalJson(payload)).toString("base64url"), grant);
  assert.equal(payload.body_sha256, sha256Hex("{}"));
  assert.ok(payload.expires_at - payload.issued_at <= 60);
  assert.equal(signature, createHmac("sha256", "grant-secret").update(grant).digest("hex"));
});

test("parsePostgresTarget extrai host, porta, base e usuário", () => {
  assert.deepEqual(parsePostgresTarget(LOCAL_DSN), {
    host: "127.0.0.1",
    port: "5432",
    database: "giro_smoke",
    user: "postgres",
  });
});

test("looksProduction reconhece marcadores de produção", () => {
  assert.ok(looksProduction("db.prod.giro.internal"));
  assert.ok(looksProduction("giro_production"));
  assert.ok(!looksProduction("giro_smoke_local"));
  assert.ok(isLoopback("127.0.0.1"));
  assert.ok(!isLoopback("db.example.com"));
});

test("assertTargetAllowed recusa produção mesmo com confirmação", () => {
  assert.throws(
    () =>
      assertTargetAllowed({
        mode: "external",
        databaseUrl: "postgresql://app:x@db.prod.example:5432/giro",
        baseUrls: ["https://api.example"],
        allowExternal: "1",
        confirmWrites: "CONFIRMO-ESCRITA:db.prod.example/giro",
      }),
    /parece produção/u,
  );
});

test("assertTargetAllowed exige loopback no modo local", () => {
  assert.throws(
    () => assertTargetAllowed({ mode: "local", databaseUrl: "postgresql://a:b@db.example:5432/x" }),
    /loopback/u,
  );
  assert.deepEqual(
    assertTargetAllowed({
      mode: "local",
      databaseUrl: LOCAL_DSN,
      baseUrls: ["http://127.0.0.1:8870"],
    }),
    { confirmationPhrase: null },
  );
});

test("assertTargetAllowed exige opt-in e frase exata no modo external", () => {
  const databaseUrl = "postgresql://app:x@staging-db.example:5432/giro_staging";
  assert.throws(
    () => assertTargetAllowed({ mode: "external", databaseUrl, baseUrls: [] }),
    /SMOKE_ALLOW_EXTERNAL=1/u,
  );
  assert.throws(
    () =>
      assertTargetAllowed({
        mode: "external",
        databaseUrl,
        baseUrls: [],
        allowExternal: "1",
        confirmWrites: "sim",
      }),
    /SMOKE_CONFIRM_WRITES="CONFIRMO-ESCRITA:staging-db\.example\/giro_staging"/u,
  );
  assert.deepEqual(
    assertTargetAllowed({
      mode: "external",
      databaseUrl,
      baseUrls: ["https://staging-gateway.example"],
      allowExternal: "1",
      confirmWrites: "CONFIRMO-ESCRITA:staging-db.example/giro_staging",
    }),
    { confirmationPhrase: "CONFIRMO-ESCRITA:staging-db.example/giro_staging" },
  );
});
