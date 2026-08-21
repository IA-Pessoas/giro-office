import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const { fetchReportsCatalog, normalizeReportsError, unwrapReportsCatalogEnvelope, unwrapReportsEnvelope } = await import(
  "./services/reportsService.contract.ts"
);
const { reportsCatalogQueryKey } = await import("./hooks/queryKeys.ts");
const appPackage = JSON.parse(await readFile(new URL("../../../package.json", import.meta.url)));

function runTest(name, callback) {
  try {
    callback();
    process.stdout.write(`PASS ${name}\n`);
  } catch (error) {
    process.stderr.write(`FAIL ${name}\n`);
    throw error;
  }
}

runTest("unwraps the shared success envelope", () => {
  assert.deepEqual(unwrapReportsEnvelope({ success: true, data: { items: [] } }), { items: [] });
});

runTest("rejects malformed catalog data", () => {
  assert.throws(
    () => unwrapReportsCatalogEnvelope({ success: true, data: { items: {} } }),
    (error) => {
      assert.deepEqual(error, { message: "Não foi possível carregar relatórios agora." });
      return true;
    },
  );
});

runTest("rejects an error envelope without exposing its message", () => {
  assert.throws(
    () => unwrapReportsEnvelope({ success: false, error: "upstream database is unavailable" }),
    (error) => {
      assert.deepEqual(error, { message: "Não foi possível carregar relatórios agora." });
      return true;
    },
  );
});

runTest("does not expose upstream error details", () => {
  const error = normalizeReportsError({
    response: {
      status: 502,
      data: { error: "postgres://user:secret@upstream.internal/reports" },
    },
  });

  assert.deepEqual(error, {
    message: "Não foi possível carregar relatórios agora.",
    status: 502,
  });
});

await (async () => {
  let requestedPath;
  const catalog = await fetchReportsCatalog(async (path) => {
      requestedPath = path;
      return {
        data: {
          success: true,
          data: { items: [{ key: "rh.requests", label: "Solicitações", module: "rh", fields: [] }] },
        },
      };
  });

  runTest("loads catalog from the public reports endpoint", () => {
    assert.equal(requestedPath, "/reports/catalog");
    assert.deepEqual(catalog, {
      items: [{ key: "rh.requests", label: "Solicitações", module: "rh", fields: [] }],
    });
  });
})();

runTest("uses one stable catalog query key", () => {
  assert.deepEqual(reportsCatalogQueryKey(), ["reports", "catalog"]);
});

runTest("includes reports coverage in the app test suite", () => {
  assert.match(appPackage.scripts.test, /test:reports/);
});
