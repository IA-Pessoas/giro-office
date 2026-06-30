import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const conversationWindowUrl = new URL("./components/ConversationWindow.tsx", import.meta.url);
const source = await readFile(conversationWindowUrl, "utf8");

async function runTest(name, fn) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

function getFunctionSource(functionName) {
  const start = source.indexOf(`const ${functionName} =`);
  const nextConst = source.indexOf("\n    const ", start + 1);
  const nextUseEffect = source.indexOf("\n    useEffect", start + 1);
  const nextReturn = source.indexOf("\n    return (", start + 1);
  const endCandidates = [nextConst, nextUseEffect, nextReturn].filter((index) => index !== -1);
  const end = Math.min(...endCandidates);

  assert.notEqual(start, -1);
  assert.notEqual(end, Infinity);

  return source.slice(start, end);
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
