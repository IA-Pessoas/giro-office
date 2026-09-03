#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";

function readEnv(file) {
  const env = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator < 1) continue;
    const key = trimmed.slice(0, separator);
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

const envRoot = path.resolve(process.argv[2] ?? process.cwd());
const gateway = readEnv(path.join(envRoot, ".env.vps.gateway"));
const contabil = readEnv(path.join(envRoot, ".env.vps.contabil-service"));
const gatewayToken = gateway.AUDIT_SERVICE_TOKEN;
const contabilToken = contabil.INTERNAL_SERVICE_TOKEN || contabil.AUDIT_SERVICE_TOKEN;

if (!gatewayToken) {
  console.error("gateway: AUDIT_SERVICE_TOKEN ausente");
  process.exit(1);
}

if (!contabilToken) {
  console.error("contabil-service: token interno ausente");
  process.exit(1);
}

if (contabilToken !== gatewayToken) {
  console.error("contabil-service: token interno diverge do gateway");
  process.exit(1);
}

console.log("Tokens internos: gateway e contabil-service alinhados.");
