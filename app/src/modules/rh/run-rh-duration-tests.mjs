import assert from "node:assert/strict";

const { formatRhDuration } = await import("./utils/rhDuration.ts");

function runTest(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

runTest("format duration keeps hours and minutes in the right units", () => {
  assert.equal(formatRhDuration(480), "8h");
  assert.equal(formatRhDuration(510), "8h 30min");
  assert.equal(formatRhDuration(8), "8min");
});

runTest("format duration preserves zero and balance signs", () => {
  assert.equal(formatRhDuration(0), "0min");
  assert.equal(formatRhDuration(30, { showPositiveSign: true }), "+30min");
  assert.equal(formatRhDuration(-75, { showPositiveSign: true }), "-1h 15min");
  assert.equal(formatRhDuration(null), "-");
  assert.equal(formatRhDuration(undefined), "-");
});
