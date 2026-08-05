import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const conversationWindowUrl = new URL("./components/ConversationWindow.tsx", import.meta.url);
const groupInfoSidebarUrl = new URL("./components/GroupInfoSidebar.tsx", import.meta.url);
const chatListPanelUrl = new URL("./components/ChatListPanel.tsx", import.meta.url);
const source = await readFile(conversationWindowUrl, "utf8");
const groupInfoSidebarSource = await readFile(groupInfoSidebarUrl, "utf8");
const chatListPanelSource = await readFile(chatListPanelUrl, "utf8");
const failures = [];

async function runTest(name, fn) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    console.error(error instanceof Error ? error.message : error);
    failures.push(name);
  }
}

function getFunctionSource(functionName, componentSource = source) {
  const start = componentSource.indexOf(`const ${functionName} =`);
  const nextConst = componentSource.indexOf("\n    const ", start + 1);
  const nextUseEffect = componentSource.indexOf("\n    useEffect", start + 1);
  const nextReturn = componentSource.indexOf("\n    return (", start + 1);
  const endCandidates = [nextConst, nextUseEffect, nextReturn].filter((index) => index !== -1);
  const end = Math.min(...endCandidates);

  assert.notEqual(start, -1);
  assert.notEqual(end, Infinity);

  return componentSource.slice(start, end);
}

await runTest("recording resources have centralized cleanup helpers", () => {
  assert.match(source, /const timerIntervalRef = useRef<ReturnType<typeof setInterval> \| null>\(null\);/);
  assert.match(source, /const recordingStreamRef = useRef<MediaStream \| null>\(null\);/);
  assert.match(source, /const clearRecordingTimer = useCallback\(\(\) => \{/);
  assert.match(source, /const stopRecordingStream = useCallback\(\(\) => \{/);
  assert.match(source, /const stopActiveRecording = useCallback\(\(cancelled: boolean, updateState = true\) => \{/);
});

await runTest("start recording clears stale timer and stream before requesting a new stream", () => {
  const startRecordingSource = getFunctionSource("handleStartRecording");
  const clearTimerIndex = startRecordingSource.indexOf("clearRecordingTimer();");
  const stopStreamIndex = startRecordingSource.indexOf("stopRecordingStream();");
  const getUserMediaIndex = startRecordingSource.indexOf("navigator.mediaDevices.getUserMedia");

  assert.notEqual(clearTimerIndex, -1);
  assert.notEqual(stopStreamIndex, -1);
  assert.notEqual(getUserMediaIndex, -1);
  assert.ok(clearTimerIndex < getUserMediaIndex);
  assert.ok(stopStreamIndex < getUserMediaIndex);
});

await runTest("stale getUserMedia resolutions stop the new stream before starting a recorder", () => {
  const startRecordingSource = getFunctionSource("handleStartRecording");
  const stopActiveRecordingSource = getFunctionSource("stopActiveRecording");
  const requestIdIndex = startRecordingSource.indexOf("const recordingRequestId =");
  const getUserMediaIndex = startRecordingSource.indexOf("navigator.mediaDevices.getUserMedia");
  const staleGuardIndex = startRecordingSource.indexOf("recordingRequestIdRef.current !== recordingRequestId");
  const stopPendingStreamIndex = startRecordingSource.indexOf("stopMediaStream(stream);");
  const recorderIndex = startRecordingSource.indexOf("new MediaRecorder");

  assert.match(source, /const recordingRequestIdRef = useRef\(0\);/);
  assert.match(stopActiveRecordingSource, /recordingRequestIdRef\.current \+= 1;/);
  assert.notEqual(requestIdIndex, -1);
  assert.notEqual(getUserMediaIndex, -1);
  assert.notEqual(staleGuardIndex, -1);
  assert.notEqual(stopPendingStreamIndex, -1);
  assert.notEqual(recorderIndex, -1);
  assert.ok(requestIdIndex < getUserMediaIndex);
  assert.ok(getUserMediaIndex < staleGuardIndex);
  assert.ok(staleGuardIndex < stopPendingStreamIndex);
  assert.ok(stopPendingStreamIndex < recorderIndex);
});

await runTest("manual stop paths use shared recording cleanup", () => {
  assert.match(getFunctionSource("handleStopRecording"), /stopActiveRecording\(false\);/);
  assert.match(getFunctionSource("handleStopAndSendRecording"), /stopActiveRecording\(false\);/);
  assert.match(getFunctionSource("handleCancelRecording"), /stopActiveRecording\(true\);/);
  assert.equal(source.includes("clearInterval(timerIntervalRef.current!);"), false);
});

await runTest("unmount cleanup cancels active recording without setting state", () => {
  assert.match(source, /return \(\) => \{\s*stopActiveRecording\(true, false\);\s*\};/s);
});

await runTest("media recorder onstop always releases recorder and microphone stream", () => {
  const startRecordingSource = getFunctionSource("handleStartRecording");

  assert.match(startRecordingSource, /recordingStreamRef\.current = stream;/);
  assert.match(startRecordingSource, /mediaRecorderRef\.current = null;/);
  assert.match(startRecordingSource, /stopRecordingStream\(\);/);
});

await runTest("recorder setup failures release active recording resources", () => {
  const startRecordingSource = getFunctionSource("handleStartRecording");
  const catchIndex = startRecordingSource.indexOf("} catch (err) {");

  assert.notEqual(catchIndex, -1);

  const catchSource = startRecordingSource.slice(catchIndex);

  assert.match(catchSource, /mediaRecorderRef\.current = null;/);
  assert.match(catchSource, /stopRecordingStream\(\);/);
  assert.match(catchSource, /clearRecordingTimer\(\);/);
  assert.match(catchSource, /setIsRecording\(false\);/);
});

await runTest("member removal is delegated exclusively to ConfirmationDialog onConfirm", () => {
  assert.ok(
    /import\s*\{[^}]*\bConfirmationDialog\b[^}]*\}\s*from\s*["']@shared\/components["'];/.test(
      groupInfoSidebarSource,
    ),
    "GroupInfoSidebar must import ConfirmationDialog from @shared/components",
  );

  const confirmationDialogSource = groupInfoSidebarSource.match(
    /<ConfirmationDialog\b[\s\S]*?\/>/,
  )?.[0];

  assert.ok(confirmationDialogSource, "GroupInfoSidebar must render ConfirmationDialog");

  const confirmHandlerName = confirmationDialogSource.match(
    /onConfirm=\{([A-Za-z_$][\w$]*)\}/,
  )?.[1];

  assert.ok(confirmHandlerName, "ConfirmationDialog must receive a named onConfirm handler");

  const confirmHandlerSource = getFunctionSource(confirmHandlerName, groupInfoSidebarSource);
  const removalCalls = groupInfoSidebarSource.match(/removeMemberFromGroup\s*\(/g) ?? [];

  assert.equal(removalCalls.length, 1);
  assert.match(confirmHandlerSource, /removeMemberFromGroup\s*\(/);
});

await runTest("microphone failures use toast.error feedback", () => {
  const startRecordingSource = getFunctionSource("handleStartRecording");
  const catchIndex = startRecordingSource.indexOf("} catch (err) {");

  assert.notEqual(catchIndex, -1);
  assert.ok(
    /toast\.error\("Não foi possível acessar o microfone\. Verifique as permissões do navegador\."\);/.test(
      startRecordingSource.slice(catchIndex),
    ),
    "the microphone catch branch must call toast.error",
  );
});

await runTest("missing group name and participants use toast.error feedback", () => {
  const createGroupSource = getFunctionSource("handleCreateGroup", chatListPanelSource);
  const expectedMessages = [
    "Por favor, digite um nome para o grupo.",
    "Selecione pelo menos um participante.",
  ];
  const missingMessages = expectedMessages.filter(
    (message) => !createGroupSource.includes(`toast.error("${message}");`),
  );

  assert.deepEqual(missingMessages, [], "missing toast.error validation messages");
});

await runTest("chat UI components do not use native feedback APIs", () => {
  const nativeFeedbackPattern = /\b(?:window\.)?(?:alert|confirm|prompt)\s*\(/;
  const offenders = [
    ["ConversationWindow", source],
    ["GroupInfoSidebar", groupInfoSidebarSource],
    ["ChatListPanel", chatListPanelSource],
  ]
    .filter(([, componentSource]) => nativeFeedbackPattern.test(componentSource))
    .map(([componentName]) => componentName);

  assert.deepEqual(offenders, [], "components using native feedback APIs");
});

if (failures.length > 0) {
  console.error(`FAILED ${failures.length} chat UI contract(s)`);
  process.exitCode = 1;
}
