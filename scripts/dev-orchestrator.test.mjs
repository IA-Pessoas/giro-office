import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  activeStateComponents,
  buildPackagesToCompile,
  buildPlan,
  findStateConflicts,
  formatPlan,
  parseArgs,
  recoverDevelopment,
  writeState,
} from "./dev-orchestrator.mjs";

test("perfis incluem base, área e watch somente nos componentes escolhidos", () => {
  const plan = buildPlan({ profile: "rh" });
  const byId = new Map(plan.components.map((component) => [component.id, component]));

  assert.equal(byId.get("app")?.mode, "watch");
  assert.equal(byId.get("rh-service")?.mode, "watch");
  assert.equal(byId.get("user-service")?.mode, "stable");
  assert.equal(byId.get("organization-service")?.mode, "stable");
  assert.equal(byId.get("reports-service")?.mode, "stable");
  assert.deepEqual(buildPackagesToCompile(plan), [
    "@workspace/shared",
    "@workspace/api",
    "@workspace/gateway",
    "@workspace/client-service",
    "@workspace/audit-service",
    "@workspace/user-service",
    "@workspace/organization-service",
    "@workspace/department-service",
    "@workspace/reports-service",
  ]);
});

test("seleção explícita adiciona serviço e shared em watch", () => {
  const options = parseArgs([
    "--profile",
    "base",
    "--service=ti-service",
    "--watch",
    "shared,ti-service",
  ]);
  const plan = buildPlan(options);
  const byId = new Map(plan.components.map((component) => [component.id, component]));

  assert.equal(byId.get("app")?.mode, "watch");
  assert.equal(byId.get("ti-service")?.mode, "watch");
  assert.equal(byId.get("shared")?.mode, "watch");
  assert.equal(byId.get("gateway")?.mode, "stable");
  assert.match(byId.get("gateway")?.entrypoint, /^dist\//u);
});

test("worker é opt-in e não cria um segundo processo HTTP", () => {
  const plan = buildPlan({ profile: "full", worker: true });
  const workers = plan.components.filter(({ id }) => id === "reports-worker");

  assert.equal(workers.length, 1);
  assert.equal(workers[0].mode, "watch");
  assert.equal(workers[0].command, "worker");
});

test("estado reaproveita somente PIDs vivos e denuncia modo incompatível", async () => {
  const state = {
    version: 1,
    components: [
      { id: "app", packageName: "@workspace/app", mode: "watch", pid: 10 },
      { id: "gateway", packageName: "@workspace/gateway", mode: "watch", pid: 11 },
    ],
  };
  const plan = buildPlan({ profile: "base" });
  const result = await findStateConflicts(plan, state, {
    isAlive: (pid) => pid === 10 || pid === 11,
    isPortBusy: () => false,
  });

  assert.deepEqual(
    activeStateComponents(state, (pid) => pid === 10),
    [state.components[0]],
  );
  assert.deepEqual(result.active, state.components);
  assert.match(result.conflicts.join("\n"), /gateway já está ativo como watch/u);
  assert.match(formatPlan(plan, result), /reutilizar app/u);
});

test("porta ocupada fora do estado é conflito sem ação destrutiva", async () => {
  const plan = buildPlan({ profile: "base" });
  const result = await findStateConflicts(plan, null, {
    isAlive: () => false,
    isPortBusy: (port) => port === 3000,
  });

  assert.equal(result.active.length, 0);
  assert.match(result.conflicts[0], /porta 3000 está ocupada/u);
});

test("recuperação em conferência não mata processos nem remove artefatos", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "giro-dev-"));
  const statePath = path.join(root, ".turbo", "dev", "state.json");
  const state = {
    version: 1,
    root,
    components: [{ id: "app", pid: 10, mode: "watch", packageName: "@workspace/app" }],
  };

  try {
    await writeState(state, statePath);
    const result = await recoverDevelopment({ statePath, apply: false, isAlive: () => true });
    assert.deepEqual(result.tracked, [{ id: "app", pid: 10 }]);
    assert.deepEqual(JSON.parse(await readFile(statePath, "utf8")), state);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("recuperação aplicada encerra somente o estado registrado e pode limpar o cache dev", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "giro-dev-"));
  const statePath = path.join(root, ".turbo", "dev", "state.json");
  const nextDevPath = path.join(root, "app", ".next", "dev");
  const killed = [];

  try {
    await writeState(
      {
        version: 1,
        root,
        components: [{ id: "gateway", pid: 12, mode: "stable", packageName: "@workspace/gateway" }],
      },
      statePath,
    );
    await mkdir(nextDevPath, { recursive: true });
    const result = await recoverDevelopment({
      rootDir: root,
      statePath,
      apply: true,
      cleanNext: true,
      isAlive: () => true,
      kill: (pid) => killed.push(pid),
    });

    assert.deepEqual(killed, [12]);
    assert.deepEqual(result.stopped, ["gateway"]);
    await assert.rejects(readFile(statePath, "utf8"));
    await assert.rejects(readFile(nextDevPath, "utf8"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
