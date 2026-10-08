interface ReportJobWorker {
  expireDue(): Promise<void>;
  processNext(): Promise<boolean>;
}

/**
 * Um tick do cron. O worker Node faz polling a cada 5 s; cron tem granularidade de
 * 1 min, então cada tick drena a fila em rodadas de `concurrency` até esvaziar ou
 * até o prazo, para não represar jobs entre ticks.
 */
export async function drainReportJobs(
  worker: ReportJobWorker,
  {
    concurrency,
    deadlineMs,
    now = Date.now,
  }: { concurrency: number; deadlineMs: number; now?: () => number },
): Promise<number> {
  const deadline = now() + deadlineMs;
  await worker.expireDue();
  let processed = 0;
  while (now() < deadline) {
    const round = await Promise.all(
      Array.from({ length: concurrency }, () => worker.processNext()),
    );
    const done = round.filter(Boolean).length;
    processed += done;
    if (done === 0) break;
  }
  return processed;
}
