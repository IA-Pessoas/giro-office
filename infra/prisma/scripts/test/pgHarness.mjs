import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { after, before } from "node:test";

// Postgres descartavel em Docker para testar os reparos SQL de verdade. Sem Docker, os testes
// que usam `skip: !hasDocker` sao pulados.
export const hasDocker = spawnSync("docker", ["info"], { stdio: "ignore" }).status === 0;

/**
 * Registra before/after que sobem e removem um container postgres:17 e devolve helpers de psql.
 * `setup` roda uma vez depois que o banco responde (ex.: fixture comum a todos os testes).
 */
export function usePostgres(prefix, { setup } = {}) {
  const container = `${prefix}-${process.pid}`;

  // TCP, nao socket: durante o init a imagem sobe um servidor temporario so no socket e depois
  // reinicia. Pelo socket o `SELECT 1` passava nessa janela e os testes caiam no restart.
  function psql(sql, vars = []) {
    const args = ["exec", "-i", container, "psql", "-h", "127.0.0.1", "-U", "postgres", "-X", "-q", "-t", "-A"];
    for (const v of vars) args.push("-v", v);
    return spawnSync("docker", [...args, "-f", "-"], { input: sql, encoding: "utf8" });
  }

  function query(sql) {
    const result = psql(sql);
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  }

  before(() => {
    if (!hasDocker) return;
    execFileSync("docker", [
      "run", "-d", "--rm", "--name", container, "-e", "POSTGRES_HOST_AUTH_METHOD=trust", "postgres:17",
    ]);
    for (let i = 0; i < 60; i++) {
      if (psql("SELECT 1").status === 0) {
        if (setup) query(setup);
        return;
      }
      execFileSync("sleep", ["1"]);
    }
    throw new Error("Postgres de teste nao subiu");
  });

  after(() => {
    if (hasDocker) spawnSync("docker", ["rm", "-f", container], { stdio: "ignore" });
  });

  return { psql, query };
}
