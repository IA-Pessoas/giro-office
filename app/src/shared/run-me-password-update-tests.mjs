import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { updateCurrentUser } from "../../../packages/api/src/services/userService.ts";
import {
  buildSelfProfileUpdatePayload,
  PROFILE_UPDATE_ERROR_MESSAGE,
} from "./utils/meProfileUpdate.ts";

const currentUser = {
  id: "user-1",
  name: "Usuário comum",
  login: "usuario",
  permission: 0,
  department_id: "dep-1",
  photo_url: null,
  organization_id: "org-1",
  type: "user",
};

const patchCalls = [];
const client = {
  async get() {
    return { data: { success: true, data: currentUser } };
  },
  async patch(url, body) {
    patchCalls.push([url, body]);
    return { data: { success: true, data: currentUser } };
  },
};

await updateCurrentUser(client, { password: "nova-senha-segura" });

assert.deepEqual(patchCalls, [["/user/user-1", { password: "nova-senha-segura" }]]);
assert.equal(Object.hasOwn(patchCalls[0][1], "name"), false);

assert.deepEqual(
  buildSelfProfileUpdatePayload({
    canManageUsers: false,
    currentName: "Usuário comum",
    name: "Nome não permitido",
    password: "nova-senha-segura",
  }),
  { password: "nova-senha-segura" },
);
assert.equal(
  buildSelfProfileUpdatePayload({
    canManageUsers: false,
    currentName: "Usuário comum",
    name: "Nome não permitido",
    password: "",
  }),
  null,
);
assert.deepEqual(
  buildSelfProfileUpdatePayload({
    canManageUsers: true,
    currentName: "Administradora RH",
    name: "Administradora de Pessoas",
    password: "nova-senha-segura",
  }),
  { name: "Administradora de Pessoas", password: "nova-senha-segura" },
);
assert.equal(PROFILE_UPDATE_ERROR_MESSAGE, "Nao foi possivel atualizar o perfil.");

const mePageSource = await readFile(
  fileURLToPath(new URL("../pages/me/index.tsx", import.meta.url)),
  "utf8",
);
const settingsSource = await readFile(
  fileURLToPath(new URL("../shared/components/newLayout/Configuracoes.tsx", import.meta.url)),
  "utf8",
);
const meMutationSource = await readFile(
  fileURLToPath(new URL("hooks/useMeMutations.ts", import.meta.url)),
  "utf8",
);

assert.match(mePageSource, /useMe\(\)/);
assert.doesNotMatch(mePageSource, /useUserProfile/);
assert.match(mePageSource, /id="me-new-password"[\s\S]*?type="password"/);
assert.match(mePageSource, /disabled=\{!canManageUsers \|\| updateUserMutation\.isPending\}/);
assert.match(mePageSource, /onSuccess:\s*\(\)\s*=>\s*setNewPassword\(""\)/);

assert.match(settingsSource, /import \{ useAuth \} from "@\/context\/AuthContext"/);
assert.match(settingsSource, /const \{ user \} = useAuth\(\);/);
assert.match(settingsSource, /const canManageUsers = canCreateUsers\(user\);/);
assert.match(settingsSource, /id="settings-access-password"[\s\S]*?type="password"/);
assert.match(settingsSource, /disabled=\{isSaving \|\| !canManageUsers\}/);
assert.match(settingsSource, /await updateMeMutation\.mutateAsync\(accessUpdatePayload\);\s*setPassword\(""\);/);
assert.match(meMutationSource, /toast\.error\(PROFILE_UPDATE_ERROR_MESSAGE\)/);

console.log("me password update contract tests passed");
