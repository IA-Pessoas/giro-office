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

function getUploadFunctionSource() {
  const start = source.indexOf("const uploadFileAndSendMessage = useCallback");
  const end = source.indexOf("const getSignedMediaUrl = useCallback", start);

  assert.notEqual(start, -1);
  assert.notEqual(end, -1);

  return source.slice(start, end);
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

await runTest("chat upload has a 10 MB client-side size limit", () => {
  assert.match(source, /const MAX_CHAT_UPLOAD_BYTES = 10 \* 1024 \* 1024;/);
  assert.match(source, /const MAX_CHAT_UPLOAD_MB = MAX_CHAT_UPLOAD_BYTES \/ \(1024 \* 1024\);/);
  assert.match(source, /file\.size > MAX_CHAT_UPLOAD_BYTES/);
  assert.match(source, /toast\.error\(CHAT_UPLOAD_SIZE_ERROR_MESSAGE\)/);
});

await runTest("chat upload validates size before upload state and FormData", () => {
  const uploadSource = getUploadFunctionSource();
  const sizeValidationIndex = uploadSource.indexOf("file.size > MAX_CHAT_UPLOAD_BYTES");
  const uploadStateIndex = uploadSource.indexOf("setIsUploading(true)");
  const formDataIndex = uploadSource.indexOf("const formData = new FormData()");

  assert.notEqual(sizeValidationIndex, -1);
  assert.notEqual(uploadStateIndex, -1);
  assert.notEqual(formDataIndex, -1);
  assert.ok(sizeValidationIndex < uploadStateIndex);
  assert.ok(sizeValidationIndex < formDataIndex);
});

await runTest("chat upload uses toast feedback instead of alert", () => {
  const uploadSource = getUploadFunctionSource();

  assert.equal(uploadSource.includes("alert("), false);
  assert.match(uploadSource, /toast\.error\("Tipo de arquivo nao suportado\."\)/);
  assert.match(uploadSource, /toast\.error\(CHAT_UPLOAD_SIZE_ERROR_MESSAGE\)/);
  assert.match(uploadSource, /toast\.error\("Nao foi possivel enviar sua midia\."\)/);
});

await runTest("group detail update failure uses toast feedback instead of alert", () => {
  const updateGroupDetailsSource = source.match(
    /const updateGroupDetails = useCallback\(async \(chatId:[\s\S]*?\n    \}, \[\]\);/,
  )?.[0] ?? "";

  assert.match(
    updateGroupDetailsSource,
    /toast\.error\("Não foi possível atualizar os detalhes do grupo\."\)/,
  );
  assert.equal(updateGroupDetailsSource.includes("alert("), false);
});

await runTest("provider value is memoized with the public context type", () => {
  assert.match(source, /const value = useMemo<ChatContextType>\(\(\) => \(\{/);
});
