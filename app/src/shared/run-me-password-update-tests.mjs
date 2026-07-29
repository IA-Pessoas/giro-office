import assert from "node:assert/strict";

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
assert.equal(PROFILE_UPDATE_ERROR_MESSAGE, "Nao foi possivel atualizar o perfil.");

console.log("me password update contract tests passed");
