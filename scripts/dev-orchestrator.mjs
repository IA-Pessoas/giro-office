import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { serviceRegistry } from "./service-registry.mjs";

const STATE_VERSION = 1;
const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DEFAULT_ROOT = resolve(dirname(SCRIPT_PATH), "..");
const DEFAULT_STATE_PATH = join(DEFAULT_ROOT, ".turbo", "dev", "state.json");
const BASE_SERVICES = [
  "gateway",
  "client-service",
  "audit-service",
  "user-service",
  "organization-service",
];

const profiles = {
  base: {
    label: "UI + base",
    services: BASE_SERVICES,
    defaultWatch: ["app"],
  },
  rh: {
    label: "RH",
    services: ["rh-service", "department-service", "reports-service"],
    defaultWatch: ["app", "rh-service"],
  },
  contabil: {
    label: "Contábil",
    services: ["contabil-service", "fiscal-service", "triagem-service", "reports-service"],
    defaultWatch: ["app", "contabil-service"],
  },
  integracao: {
    label: "Integrações e projetos",
    services: ["task-service", "project-service", "commercial-service", "reports-service"],
    defaultWatch: ["app", "task-service"],
  },
  regularize: {
    label: "Regularização",
    services: ["regularize-service", "reports-service"],
    defaultWatch: ["app", "regularize-service"],
  },
  ti: {
    label: "TI",
    services: ["ti-service", "reports-service"],
    defaultWatch: ["app", "ti-service"],
  },
  full: {
    label: "stack completa",
    services: serviceRegistry.map(({ name }) => name),
    defaultWatch: ["app"],
  },
};

const componentDefinitions = new Map([
  [
    "app",
    {
      id: "app",
      packageName: "@workspace/app",
      label: "app",
      port: 3000,
      stableRunnable: false,
      reason: "interface web",
    },
  ],
  [
    "shared",
    {
      id: "shared",
      packageName: "@workspace/shared",
      label: "shared",
      port: null,
      stableRunnable: false,
      reason: "código compartilhado; watch somente quando estiver em edição",
    },
  ],
  [
    "api",
    {
      id: "api",
      packageName: "@workspace/api",
      label: "api",
      port: null,
      stableRunnable: false,
      reason: "cliente compartilhado da UI",
    },
  ],
  [
    "reports-worker",
    {
      id: "reports-worker",
      packageName: "@workspace/reports-service",
      label: "reports-worker",
      command: "worker",
      port: null,
      stableRunnable: false,
      reason: "job opcional do fluxo de Relatórios",
    },
  ],
]);

for (const service of serviceRegistry) {
  const port = service.defaultUrl ? Number(new URL(service.defaultUrl).port) : null;
  const packageManifest = JSON.parse(
    readFileSync(join(DEFAULT_ROOT, service.packagePath, "package.json"), "utf8"),
  );
  componentDefinitions.set(service.name, {
    id: service.name,
    packageName:
      service.name === "legacy-api" ? "@workspace/legacy-api" : `@workspace/${service.name}`,
    label: service.name,
    port: Number.isInteger(port) && port > 0 ? port : null,
    entrypoint: packageManifest.main ?? "dist/server.js",
    stableRunnable: true,
    reason: "dependência HTTP do fluxo selecionado",
  });
}

function splitValues(value) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function canonicalId(value) {
  const normalized = value.replace(/^@workspace\//u, "");
  if (normalized === "reports-service:worker" || normalized === "worker") return "reports-worker";
  return normalized;
}

function packageManagerCommand() {
  return process.platform === "win32" ? "pnpm.cmd" : "pnpm";
}

function parseOptionValue(args, index, option) {
  const current = args[index];
  if (current.startsWith(`${option}=`)) return [current.slice(option.length + 1), index];
  const next = args[index + 1];
  if (!next || next.startsWith("--")) throw new Error(`${option} exige um valor.`);
  return [next, index + 1];
}

export function parseArgs(args) {
  const options = {
    action: "start",
    profile: "base",
    services: [],
    watch: [],
    watchSpecified: false,
    worker: false,
    dryRun: false,
    apply: false,
    cleanNext: false,
    help: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "recover") {
      options.action = "recover";
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--full") {
      options.profile = "full";
    } else if (arg === "--worker") {
      options.worker = true;
    } else if (arg === "--dry-run" || arg === "--plan") {
      options.dryRun = true;
    } else if (arg === "--apply") {
      options.apply = true;
    } else if (arg === "--clean-next") {
      options.cleanNext = true;
    } else if (arg === "--profile") {
      const [value, nextIndex] = parseOptionValue(args, index, "--profile");
      options.profile = value;
      index = nextIndex;
    } else if (arg.startsWith("--profile=")) {
      options.profile = arg.slice("--profile=".length);
    } else if (arg === "--service" || arg.startsWith("--service=")) {
      const [value, nextIndex] = parseOptionValue(args, index, "--service");
      options.services.push(...splitValues(value));
      index = nextIndex;
    } else if (arg === "--watch" || arg.startsWith("--watch=")) {
      const [value, nextIndex] = parseOptionValue(args, index, "--watch");
      options.watchSpecified = true;
      if (value !== "none") options.watch.push(...splitValues(value));
      index = nextIndex;
    } else {
      throw new Error(`Opção desconhecida: ${arg}`);
    }
  }

  return options;
}

function getComponent(id) {
  const component = componentDefinitions.get(canonicalId(id));
  if (!component) throw new Error(`Componente desconhecido: ${id}`);
  return component;
}

function assertProfile(profile) {
  if (!profiles[profile]) {
    throw new Error(`Perfil desconhecido: ${profile}. Use --help para listar os perfis.`);
  }
}

function addComponentIds(target, values, reason) {
  for (const value of values) {
    const id = canonicalId(value);
    getComponent(id);
    target.set(id, reason);
  }
}

export function buildPlan({
  profile = "base",
  services = [],
  watch = [],
  watchSpecified = false,
  worker = false,
} = {}) {
  assertProfile(profile);
  const selected = new Map();
  const definition = profiles[profile];

  addComponentIds(selected, ["app"], "interface web");
  addComponentIds(
    selected,
    BASE_SERVICES,
    "base necessária para autenticação, organização e auditoria",
  );
  addComponentIds(selected, definition.services, `dependências do perfil ${definition.label}`);
  addComponentIds(selected, services, "serviço adicional solicitado explicitamente");
  if (worker) addComponentIds(selected, ["reports-worker"], "job solicitado explicitamente");

  const requestedWatch = watchSpecified ? ["app", ...watch] : definition.defaultWatch;
  const watchIds = new Set(requestedWatch.map(canonicalId));
  for (const id of watchIds) {
    getComponent(id);
    if (!selected.has(id)) selected.set(id, "componente selecionado explicitamente para edição");
  }

  const components = [...selected.entries()].map(([id, reason]) => {
    const definitionEntry = getComponent(id);
    const mode = id === "reports-worker" || watchIds.has(id) ? "watch" : "stable";
    if (mode === "stable" && !definitionEntry.stableRunnable) {
      throw new Error(`${id} só pode ser selecionado em watch.`);
    }
    return {
      ...definitionEntry,
      mode,
      command: definitionEntry.command ?? (watchIds.has(id) ? "dev" : "start"),
      reason,
    };
  });

  return { profile, label: definition.label, components };
}

export function buildPackagesToCompile(plan) {
  const packages = new Set(["@workspace/shared"]);
  if (plan.components.some(({ id }) => id === "app")) packages.add("@workspace/api");
  for (const component of plan.components) {
    if (component.mode === "stable" && component.id !== "reports-worker") {
      packages.add(component.packageName);
    }
  }
  return [...packages];
}

function formatComponent(component, prefix = "") {
  const port = component.port ? ` :${component.port}` : "";
  return `${prefix}${component.label} [${component.mode}]${port} — ${component.reason}`;
}

export function formatPlan(plan, { active = [], conflicts = [] } = {}) {
  const activeIds = new Set(active.map(({ id }) => id));
  const lines = [`Perfil ${plan.profile}: ${plan.label}`, "Iniciar/reutilizar:"];
  for (const component of plan.components) {
    lines.push(formatComponent(component, activeIds.has(component.id) ? "  reutilizar " : "  "));
  }
  if (conflicts.length > 0) {
    lines.push("Conflitos:");
    lines.push(...conflicts.map((conflict) => `  ${conflict}`));
  }
  return lines.join("\n");
}

function defaultIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function activeStateComponents(state, isAlive = defaultIsAlive) {
  if (!state || !Array.isArray(state.components)) return [];
  return state.components.filter(
    (component) => Number.isInteger(component.pid) && isAlive(component.pid),
  );
}

export async function readState(statePath = DEFAULT_STATE_PATH) {
  try {
    const raw = await readFile(statePath, "utf8");
    const state = JSON.parse(raw);
    return state?.version === STATE_VERSION ? state : null;
  } catch {
    return null;
  }
}

export async function writeState(state, statePath = DEFAULT_STATE_PATH) {
  await mkdir(dirname(statePath), { recursive: true });
  const temporaryPath = `${statePath}.${process.pid}.tmp`;
  await writeFile(
    temporaryPath,
    `${JSON.stringify({ ...state, version: STATE_VERSION }, null, 2)}\n`,
    "utf8",
  );
  await rename(temporaryPath, statePath);
}

export async function removeState(statePath = DEFAULT_STATE_PATH) {
  await rm(statePath, { force: true });
}

export async function findStateConflicts(
  plan,
  state,
  { isAlive = defaultIsAlive, isPortBusy = null } = {},
) {
  const active = activeStateComponents(state, isAlive);
  const activeById = new Map(active.map((component) => [component.id, component]));
  const conflicts = [];

  for (const component of plan.components) {
    const running = activeById.get(component.id);
    if (
      running &&
      (running.mode !== component.mode || running.packageName !== component.packageName)
    ) {
      conflicts.push(
        `${component.label} já está ativo como ${running.mode}; não vou substituir um processo registrado.`,
      );
      continue;
    }
    if (running || !component.port || !isPortBusy) continue;
    if (await isPortBusy(component.port)) {
      conflicts.push(
        `porta ${component.port} está ocupada por processo não registrado (${component.label}); encerre-o manualmente ou escolha outra porta.`,
      );
    }
  }

  return { active, conflicts };
}

export function isPortOpen(port, host = "127.0.0.1") {
  return new Promise((resolvePort) => {
    const socket = net.createConnection({ host, port });
    const finish = (value) => {
      socket.destroy();
      resolvePort(value);
    };
    socket.setTimeout(150);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(true));
    socket.once("error", () => finish(false));
  });
}

function spawnArgs(component) {
  if (component.mode === "stable" && component.entrypoint) {
    return ["--filter", component.packageName, "exec", "node", component.entrypoint];
  }
  return ["--filter", component.packageName, "run", component.command];
}

function spawnWorkspaceCommand(component, rootDir) {
  return spawn(packageManagerCommand(), spawnArgs(component), {
    cwd: rootDir,
    env: { ...process.env, NODE_ENV: process.env.NODE_ENV ?? "development" },
    stdio: "inherit",
    shell: false,
  });
}

function spawnBuild(packages, rootDir) {
  const filters = packages.flatMap((packageName) => [`--filter=${packageName}`]);
  return spawn(
    packageManagerCommand(),
    ["exec", "turbo", "run", "build", "--concurrency=50%", ...filters],
    {
      cwd: rootDir,
      env: process.env,
      stdio: "inherit",
      shell: false,
    },
  );
}

function waitForExit(child) {
  return new Promise((resolveExit, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolveExit({ code, signal }));
  });
}

async function runBuild(packages, rootDir) {
  if (packages.length === 0) return;
  const result = await waitForExit(spawnBuild(packages, rootDir));
  if (result.code !== 0) {
    throw new Error(`build seletivo falhou${result.signal ? ` com ${result.signal}` : ""}.`);
  }
}

function processRecord(component, child) {
  return {
    id: component.id,
    label: component.label,
    packageName: component.packageName,
    command: component.command,
    mode: component.mode,
    port: component.port,
    pid: child.pid,
  };
}

async function stopChildren(children) {
  for (const child of children) {
    if (!child.killed && child.exitCode === null) child.kill("SIGTERM");
  }
}

export async function recoverDevelopment({
  rootDir = DEFAULT_ROOT,
  statePath = join(rootDir, ".turbo", "dev", "state.json"),
  apply = false,
  cleanNext = false,
  kill = (pid) => process.kill(pid, "SIGTERM"),
  isAlive = defaultIsAlive,
} = {}) {
  const state = await readState(statePath);
  const tracked = activeStateComponents(state, isAlive);
  const result = {
    apply,
    tracked: tracked.map(({ id, pid }) => ({ id, pid })),
    stopped: [],
    cleanNext: false,
  };

  if (!apply) return result;

  for (const component of tracked) {
    try {
      kill(component.pid);
      result.stopped.push(component.id);
    } catch {
      // O processo pode ter terminado entre a leitura e o encerramento.
    }
  }

  if (cleanNext) {
    await rm(join(rootDir, "app", ".next", "dev"), { recursive: true, force: true });
    result.cleanNext = true;
  }
  await removeState(statePath);
  return result;
}

export function helpText() {
  return `Uso:
  pnpm dev                                  perfil base, sem reset destrutivo
  pnpm dev -- --profile rh                  UI + base + RH
  pnpm dev -- --profile contabil            UI + base + Contábil
  pnpm dev -- --profile integracao          UI + base + Integrações
  pnpm dev:full                             todos os serviços HTTP
  pnpm dev:profile -- --service ti-service  adiciona um serviço ao perfil base
  pnpm dev -- --profile rh --watch app,rh-service
  pnpm dev -- --profile rh --watch shared   recompila shared em modo watch
  pnpm dev -- --profile full --worker       inclui o worker de Relatórios
  pnpm dev -- --profile rh --plan           mostra o plano sem iniciar processos
  pnpm dev:recover -- --apply --clean-next  encerra somente PIDs registrados e limpa o cache dev do app

Perfis: ${Object.entries(profiles)
    .map(([name, profile]) => `${name} (${profile.label})`)
    .join(", ")}.
Os serviços estáveis são compilados e executados com start; somente app e os componentes
selecionados com --watch usam watch. Portas ocupadas por processos desconhecidos não são encerradas.`;
}

async function startDevelopment({
  rootDir = DEFAULT_ROOT,
  statePath = join(rootDir, ".turbo", "dev", "state.json"),
  ...options
}) {
  const plan = buildPlan(options);
  const state = await readState(statePath);
  const { active, conflicts } = await findStateConflicts(plan, state, { isPortBusy: isPortOpen });
  console.log(formatPlan(plan, { active, conflicts }));
  if (conflicts.length > 0)
    throw new Error("Não foi possível iniciar: resolva os conflitos indicados.");
  if (options.dryRun) return;

  const activeIds = new Set(active.map(({ id }) => id));
  const packages = buildPackagesToCompile(plan);
  await runBuild(packages, rootDir);

  const children = [];
  const records = [...active];
  let shuttingDown = false;
  let resolveShutdown;
  const shutdownFinished = new Promise((resolve) => {
    resolveShutdown = resolve;
  });
  const persist = async () => {
    if (records.length === 0) {
      await removeState(statePath);
      return;
    }
    await writeState({ root: rootDir, profile: plan.profile, components: records }, statePath);
  };

  const shutdown = async (exitCode = 0) => {
    if (shuttingDown) return;
    shuttingDown = true;
    await stopChildren(children);
    records.splice(
      0,
      records.length,
      ...records.filter(({ pid }) => active.some((item) => item.pid === pid)),
    );
    await persist();
    process.exitCode = exitCode;
    resolveShutdown();
  };

  process.once("SIGINT", () => void shutdown(0));
  process.once("SIGTERM", () => void shutdown(0));

  for (const component of plan.components) {
    if (activeIds.has(component.id)) continue;
    const child = spawnWorkspaceCommand(component, rootDir);
    children.push(child);
    const record = processRecord(component, child);
    records.push(record);
    await persist();
    child.once("exit", async (code) => {
      const index = records.findIndex(({ pid }) => pid === child.pid);
      if (index >= 0) records.splice(index, 1);
      await persist();
      if (code !== 0 && !shuttingDown) await shutdown(1);
    });
    child.once("error", async () => {
      const index = records.findIndex(({ pid }) => pid === child.pid);
      if (index >= 0) records.splice(index, 1);
      await persist();
      if (!shuttingDown) await shutdown(1);
    });
  }

  if (children.length > 0) await shutdownFinished;
}

export async function main(args = process.argv.slice(2)) {
  const options = parseArgs(args);
  if (options.help) {
    console.log(helpText());
    return;
  }
  if (options.action === "recover") {
    const result = await recoverDevelopment({ apply: options.apply, cleanNext: options.cleanNext });
    console.log(
      options.apply
        ? `Recuperação aplicada: ${result.stopped.length} processo(s) registrado(s) encerrado(s).${result.cleanNext ? " Cache dev do app removido." : ""}`
        : `Recuperação em modo de conferência: ${result.tracked.length} processo(s) registrado(s) seriam encerrado(s). Use --apply para executar.`,
    );
    return;
  }
  await startDevelopment(options);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(SCRIPT_PATH)) {
  try {
    await main();
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Falha ao preparar o desenvolvimento local.",
    );
    process.exitCode = 1;
  }
}
