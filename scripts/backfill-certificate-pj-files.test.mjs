import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  backfillLegacyCertificatePjFiles,
  scanLegacyCertificatePjFiles,
} from "./backfill-certificate-pj-files.mjs";

test("relata arquivos ausentes e migra somente o certificado PJ de ID correspondente", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "giro-cert-backfill-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const assets = path.join(root, "assets");
  await mkdir(assets);
  const dump = path.join(root, "tb_certificados.pj.sql");
  await writeFile(
    dump,
    "INSERT INTO `tb_certificados`.`pj` (`id`, `cnpj`, `arquivo`) VALUES (1, '12.345.678/0001-90', 'a.pfx'), (2, '98.765.432/0001-10', 'nao-existe.pfx'), (3, '11.111.111/0001-11', ''), (4, '22.222.222/0001-22', 'outra-pasta/a.pfx');\n",
  );
  await writeFile(path.join(assets, "a.pfx"), "arquivo de teste");

  const scanned = await scanLegacyCertificatePjFiles({ dump, assets });
  assert.match(scanned[0].certificate_id, /^[0-9a-f-]{36}$/u);
  assert.equal(scanned[1].reason, "arquivo_ausente");
  assert.equal(scanned[2].reason, "sem_referencia");
  assert.equal(scanned[3].reason, "arquivo_ausente");

  let stored = false;
  const requests = [];
  const fetcher = async (url, init) => {
    requests.push({ url, method: init?.method ?? "GET" });
    if (url.endsWith("/file") && init?.method === "POST") {
      assert.equal(init.body.get("file").name, "a.pfx");
      stored = true;
      return new Response(null, { status: 201 });
    }
    if (url.endsWith("/file")) return new Response("arquivo de teste");
    return Response.json({
      data: {
        id: scanned[0].certificate_id,
        organization_id: scanned[0].organization_id,
        cnpj: "12345678000190",
        has_certificate: stored,
      },
    });
  };
  const options = {
    dump,
    assets,
    certificateApi: "https://example.test/api/certificate",
    token: "test-token",
    fetcher,
  };
  const progress = [];
  const wrongIdentity = await backfillLegacyCertificatePjFiles({
    ...options,
    apply: true,
    fetcher: async () =>
      Response.json({
        data: {
          id: scanned[0].certificate_id,
          organization_id: scanned[0].organization_id,
          cnpj: "00000000000000",
          has_certificate: false,
        },
      }),
  });
  assert.equal(wrongIdentity[0].reason, "identidade_divergente");
  assert.equal(stored, false);
  assert.equal((await backfillLegacyCertificatePjFiles(options))[0].status, "pronto");
  assert.equal(requests.filter(({ method }) => method === "POST").length, 0);
  const applied = await backfillLegacyCertificatePjFiles({
    ...options,
    apply: true,
    onProgress: (item) => progress.push(item),
  });
  assert.deepEqual(
    applied.map(({ status }) => status),
    ["migrado", "sem_arquivo", "sem_arquivo", "sem_arquivo"],
  );
  assert.deepEqual(progress, applied);
  assert.equal(requests.filter(({ method }) => method === "POST").length, 1);
  assert.equal(
    (await backfillLegacyCertificatePjFiles({ ...options, apply: true }))[0].status,
    "ja_migrado",
  );
  assert.equal(requests.filter(({ method }) => method === "POST").length, 1);
});
