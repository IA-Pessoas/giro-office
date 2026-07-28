import assert from "node:assert/strict";

import { getSummaryItems } from "./utils/summaryItems.ts";

const limitedSummary = getSummaryItems(["a", "b", "c"], 2);

assert.deepEqual(limitedSummary.items, ["a", "b"]);
assert.equal(limitedSummary.total, 3);
assert.equal(limitedSummary.hiddenCount, 1);
assert.equal(limitedSummary.hasHiddenItems, true);

const completeSummary = getSummaryItems(["a", "b"], 5);

assert.deepEqual(completeSummary.items, ["a", "b"]);
assert.equal(completeSummary.total, 2);
assert.equal(completeSummary.hiddenCount, 0);
assert.equal(completeSummary.hasHiddenItems, false);

const negativeLimitSummary = getSummaryItems(["a", "b", "c"], -1);

assert.deepEqual(negativeLimitSummary.items, []);
assert.equal(negativeLimitSummary.total, 3);
assert.equal(negativeLimitSummary.hiddenCount, 3);
assert.equal(negativeLimitSummary.hasHiddenItems, true);

console.log("summary items tests passed");
