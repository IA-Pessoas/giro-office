import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

import { SERVER_ERROR_TOAST_ID } from "./serverErrorToast.ts";
import { createAppToast } from "./appToast.ts";

function createFakeAdapter() {
  const active = new Set();
  let nextId = 0;
  const show = (content, options = {}) => {
    const id = options.toastId ?? `auto-${nextId++}`;
    if (!active.has(id)) active.add(id);
    return id;
  };
  const adapter = Object.assign(show, {
    success: show,
    error: show,
    info: show,
    warn: show,
    warning: show,
    isActive: (id) => active.has(id),
    dismiss: (id) => {
      if (id === undefined) active.clear();
      else active.delete(id);
    },
  });
  return { adapter, active };
}

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

runTest("identical messages do not stack", () => {
  const { adapter, active } = createFakeAdapter();
  const toast = createAppToast(adapter);
  toast.error("Cliente já cadastrado.");
  toast.error("Cliente já cadastrado.");
  toast.success("Salvo.");
  toast.success("Salvo.");
  assert.equal(active.size, 1);
  assert.equal(active.has("success:Salvo."), true);
});

runTest("explicit toastId is preserved", () => {
  const { adapter, active } = createFakeAdapter();
  const toast = createAppToast(adapter);
  toast.info("Sincronizando", { toastId: "sync" });
  assert.deepEqual([...active], ["sync"]);
});

runTest("success dismisses previous errors", () => {
  const { adapter, active } = createFakeAdapter();
  const toast = createAppToast(adapter);
  toast.error("CNPJ inválido.");
  toast.error(null, {});
  toast.warn("Atenção");
  toast.success("Cliente salvo.");
  assert.deepEqual([...active].sort(), ["success:Cliente salvo.", "warn:Atenção"]);
});

runTest("caller error replaces the generic 5xx toast so one failure shows one toast", () => {
  const { adapter, active } = createFakeAdapter();
  const toast = createAppToast(adapter);
  adapter.error("genérico", { toastId: SERVER_ERROR_TOAST_ID });
  toast.error("Não foi possível salvar o cliente.");
  assert.deepEqual([...active], ["error:Não foi possível salvar o cliente."]);
});

runTest("keeps the rest of the react-toastify API", () => {
  const { adapter } = createFakeAdapter();
  const toast = createAppToast(adapter);
  assert.equal(toast.isActive, adapter.isActive);
  assert.equal(toast.dismiss, adapter.dismiss);
  assert.equal(typeof toast("Olá"), "string");
});

runTest("app code imports toast from the shared wrapper, never from react-toastify", () => {
  const srcDir = new URL("../../", import.meta.url);
  const directImport = /import \{[^}]*\btoast\b[^}]*\} from ["']react-toastify["']/;
  const offenders = readdirSync(srcDir, { recursive: true })
    .filter((file) => /\.tsx?$/.test(file) && !file.endsWith("shared/services/toast.ts"))
    .filter((file) => directImport.test(readFileSync(new URL(file, srcDir), "utf8")));
  assert.deepEqual(offenders, []);
});

runTest("toasts render at the top so they never cover form and modal footers", () => {
  const appSource = readFileSync(new URL("../../pages/_app.tsx", import.meta.url), "utf8");
  assert.match(appSource, /<ToastContainer[\s\S]*?position="top-center"/);
});
