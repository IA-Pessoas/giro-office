import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const chatContextUrl = new URL("../../context/ChatContext.tsx", import.meta.url);
const source = await readFile(chatContextUrl, "utf8");

async function runTest(name, fn) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

function count(pattern) {
  return source.match(pattern)?.length ?? 0;
}

await runTest("presence socket listeners are registered once and cleaned with handlers", () => {
  assert.equal(count(/socket\.on\(["']user_online["']/g), 1);
  assert.equal(count(/socket\.on\(["']user_offline["']/g), 1);
  assert.equal(count(/socket\.off\(["']user_online["']\s*\)/g), 0);
  assert.equal(count(/socket\.off\(["']user_offline["']\s*\)/g), 0);
});

await runTest("main socket effect does not depend on user or selectedChat", () => {
  assert.equal(source.includes("}, [socket, user, selectedChat]);"), false);
  assert.equal(source.includes("}, [socket, user]);"), false);
  assert.equal(source.includes("}, [socket, selectedChat]);"), false);
});

await runTest("socket handlers can read current state through refs", () => {
  for (const refName of ["selectedChatRef", "userRef", "chatsRef", "messagesRef"]) {
    assert.match(source, new RegExp(`const ${refName} = useRef\\(`));
  }
});

await runTest("public context functions are memoized", () => {
  for (const callbackName of [
    "selectChat",
    "fetchMoreMessages",
    "searchMessages",
    "clearSearch",
    "fetchAllUsers",
    "createDirectChat",
    "createGroupChat",
    "updateGroupDetails",
    "sendMessage",
    "deleteMessage",
    "editMessage",
    "uploadFileAndSendMessage",
    "getSignedMediaUrl",
    "startEditingMessage",
    "cancelEditingMessage",
    "addMembersToGroup",
    "removeMemberFromGroup",
    "updateMemberRole",
  ]) {
    assert.match(source, new RegExp(`const ${callbackName} = useCallback\\(`));
  }
});

await runTest("provider value is memoized with the public context type", () => {
  assert.match(source, /const value = useMemo<ChatContextType>\(\(\) => \(\{/);
});
