import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const detailsUrl = new URL("./Details.tsx", import.meta.url);
const source = await readFile(detailsUrl, "utf8");

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
  const nextConst = source.indexOf("\n  const ", start + 1);
  const nextReturn = source.indexOf("\n  if (!id)", start + 1);
  const endCandidates = [nextConst, nextReturn].filter((index) => index !== -1);
  const end = Math.min(...endCandidates);

  assert.notEqual(start, -1);
  assert.notEqual(end, Infinity);

  return source.slice(start, end);
}

await runTest("details view stores iframe loading timeout in a ref", () => {
  assert.match(source, /useRef/);
  assert.match(source, /const loadingTimerRef = useRef<ReturnType<typeof setTimeout> \| null>\(null\);/);
});

await runTest("details view clears previous timeout before scheduling another", () => {
  const handleIframeLoadSource = getFunctionSource("handleIframeLoad");
  const clearIndex = handleIframeLoadSource.indexOf("clearLoadingTimer();");
  const timeoutIndex = handleIframeLoadSource.indexOf("loadingTimerRef.current = setTimeout");

  assert.notEqual(clearIndex, -1);
  assert.notEqual(timeoutIndex, -1);
  assert.ok(clearIndex < timeoutIndex);
});

await runTest("details view clears timeout on id changes and unmount", () => {
  assert.match(source, /const clearLoadingTimer = useCallback\(\(\) => \{/);
  assert.match(source, /clearTimeout\(loadingTimerRef\.current\);/);
  assert.match(source, /loadingTimerRef\.current = null;/);
  assert.match(source, /return \(\) => \{\s*clearLoadingTimer\(\);\s*\};/s);
});
