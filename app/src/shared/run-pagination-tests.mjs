import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  getLastPage,
  getPaginationRange,
  normalizePaginatedResult,
} from "./pagination/pagination.ts";

assert.deepEqual(
  normalizePaginatedResult(["a", "b"], { page: 1, limit: 20 }),
  { data: ["a", "b"], total: 2, page: 1, limit: 20, hasMore: false },
);
assert.deepEqual(
  normalizePaginatedResult(
    { data: ["b"], total: 21, page: 2, limit: 20, hasMore: false },
    { page: 2, limit: 20 },
  ),
  { data: ["b"], total: 21, page: 2, limit: 20, hasMore: false },
);
assert.equal(getLastPage(0, 20), 1);
assert.equal(getLastPage(41, 20), 3);
assert.deepEqual(getPaginationRange(2, 20, 7), { start: 21, end: 27 });

const hookSource = readFileSync("src/shared/hooks/useDebouncedValue.ts", "utf8");
const controlsSource = readFileSync("src/shared/components/ui/PaginationControls.tsx", "utf8");
const paginationSource = readFileSync("src/shared/pagination/pagination.ts", "utf8");

assert.match(hookSource, /setTimeout/);
assert.match(hookSource, /clearTimeout/);
assert.match(controlsSource, /Anterior/);
assert.match(controlsSource, /Próxima/);

assert.match(controlsSource, /totalPages\?: number;/);
assert.match(controlsSource, /onPageChange\?: \(page: number\) => void;/);
assert.match(controlsSource, /P.gina/);
assert.match(controlsSource, /Exibindo \{count\} de \{total\}/);
assert.match(controlsSource, /type="text"/);
assert.match(controlsSource, /inputMode="numeric"/);
assert.match(controlsSource, /min=\{1\}/);
assert.match(controlsSource, /max=\{totalPages\}/);
assert.match(controlsSource, /safePage/);
assert.match(controlsSource, /onPageChange\(safePage\)/);
assert.match(controlsSource, /h-6 w-8/);
assert.doesNotMatch(controlsSource, /type="number"/);
assert.doesNotMatch(controlsSource, /getPaginationRange\(page, limit, count\)/);
assert.match(paginationSource, /export const DEFAULT_PAGE_SIZE = 20;/);

console.log("pagination contract tests passed");
