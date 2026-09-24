import { describe, expect, it, vi } from "vitest";
import { drainReportJobs } from "./jobs.js";

function fakeWorker(pending: number) {
  let left = pending;
  return {
    expireDue: vi.fn(async () => {}),
    processNext: vi.fn(async () => {
      if (left === 0) return false;
      left -= 1;
      return true;
    }),
  };
}

describe("drainReportJobs", () => {
  it("expira os vencidos e processa até esvaziar a fila", async () => {
    const worker = fakeWorker(5);

    const processed = await drainReportJobs(worker, { concurrency: 2, deadlineMs: 10_000 });

    expect(worker.expireDue).toHaveBeenCalledTimes(1);
    expect(processed).toBe(5);
  });

  it("para no prazo mesmo com fila", async () => {
    const worker = fakeWorker(100);
    let clock = 0;
    const now = () => {
      clock += 1_000;
      return clock;
    };

    const processed = await drainReportJobs(worker, { concurrency: 2, deadlineMs: 3_000, now });

    expect(processed).toBeLessThan(100);
    expect(processed).toBeGreaterThan(0);
  });
});
