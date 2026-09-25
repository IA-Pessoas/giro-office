import { createHash } from "node:crypto";
import { open, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  CASTELO_ORGANIZATION_ID,
  REQUIRED_IDENTITY_NAMESPACE,
} from "../docs/migration/v4/scripts/lib/mapping-contract.mjs";
import { iterateSqlRows } from "../docs/migration/v4/scripts/lib/sql-dump-parser.mjs";
import { uuidV5 } from "../docs/migration/v4/scripts/lib/uuid-v5.mjs";

const SOURCE_TABLE = "tb_certificados.pj";
const MAX_FILE_BYTES = 5 * 1024 * 1024;

async function indexFiles(root) {
  const byRelative = new Map();
  const byName = new Map();
  async function visit(dir) {
    for (const item of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, item.name);
      if (item.isDirectory()) {
        await visit(full);
      } else if (item.isFile() && /\.(pfx|p12)$/iu.test(item.name)) {
        const relative = path.relative(root, full).split(path.sep).join("/").toLowerCase();
        byRelative.set(relative, full);
        const key = item.name.toLowerCase();
        byName.set(key, [...(byName.get(key) ?? []), full]);
      }
    }
  }
  await visit(root);
  return { byRelative, byName };
}

export async function scanLegacyCertificatePjFiles({ dump, assets }) {
  if (path.basename(dump) !== `${SOURCE_TABLE}.sql`) {
    throw new Error(`Dump esperado: ${SOURCE_TABLE}.sql`);
  }
  const files = await indexFiles(assets);
  const rows = [];
  const seenIds = new Set();
  for await (const row of iterateSqlRows(dump)) {
    const legacyId = String(row.id ?? "").trim();
    const certificateId = /^[1-9]\d*$/u.test(legacyId)
      ? uuidV5(REQUIRED_IDENTITY_NAMESPACE, `${SOURCE_TABLE}:${legacyId}`)
      : null;
    const reference = String(row.arquivo ?? "").trim();
    const normalized = reference.replaceAll("\\", "/").replace(/^\/+/, "").toLowerCase();
    const basename = path.posix.basename(normalized);
    const exact = files.byRelative.get(normalized);
    const matches = exact ? [exact] : (files.byName.get(basename) ?? []);
    const reason = !certificateId
      ? "id_invalido"
      : seenIds.has(legacyId)
        ? "id_duplicado"
        : !reference
          ? "sem_referencia"
          : !/\.(pfx|p12)$/iu.test(reference)
            ? "tipo_nao_suportado"
            : matches.length === 0
              ? "arquivo_ausente"
              : matches.length > 1
                ? "arquivo_ambiguo"
                : null;
    seenIds.add(legacyId);
    rows.push({
      legacy_id: legacyId,
      certificate_id: certificateId,
      organization_id: CASTELO_ORGANIZATION_ID,
      reason,
      file: reason ? null : matches[0],
      cnpj: String(row.cnpj ?? "").replace(/\D/gu, ""),
    });
  }
  return rows;
}

async function apiRequest(fetcher, base, token, suffix, init) {
  const response = await fetcher(`${base.replace(/\/$/u, "")}/pj/${suffix}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...init?.headers },
  });
  if (response.status === 401 || response.status === 403) {
    throw new Error(`Acesso ao certificate-service negado (${response.status}).`);
  }
  return response;
}

export async function backfillLegacyCertificatePjFiles({
  dump,
  assets,
  certificateApi,
  token,
  apply = false,
  fetcher = fetch,
}) {
  if ((apply && !certificateApi) || (certificateApi && !token)) {
    throw new Error("Consulta ou aplicação exige --certificate-api e CERTIFICATE_MIGRATION_TOKEN.");
  }
  const rows = await scanLegacyCertificatePjFiles({ dump, assets });
  const report = [];
  for (const row of rows) {
    const item = { legacy_id: row.legacy_id, certificate_id: row.certificate_id };
    if (row.reason) {
      report.push({ ...item, status: "sem_arquivo", reason: row.reason });
      continue;
    }
    if (!certificateApi) {
      report.push({ ...item, status: "arquivo_localizado", reason: "destino_nao_verificado" });
      continue;
    }
    const detailResponse = await apiRequest(fetcher, certificateApi, token, row.certificate_id);
    if (detailResponse.status === 404) {
      report.push({ ...item, status: "pendente", reason: "certificado_destino_ausente" });
      continue;
    }
    if (!detailResponse.ok) {
      report.push({
        ...item,
        status: "pendente",
        reason: `consulta_http_${detailResponse.status}`,
      });
      continue;
    }
    const detail = (await detailResponse.json()).data;
    if (
      detail?.id !== row.certificate_id ||
      detail?.organization_id !== row.organization_id ||
      String(detail?.cnpj ?? "").replace(/\D/gu, "") !== row.cnpj
    ) {
      report.push({ ...item, status: "pendente", reason: "identidade_divergente" });
      continue;
    }
    if (detail.has_certificate) {
      const bytes = await readFile(row.file);
      const download = await apiRequest(
        fetcher,
        certificateApi,
        token,
        `${row.certificate_id}/file`,
      );
      const matches =
        download.ok &&
        createHash("sha256")
          .update(Buffer.from(await download.arrayBuffer()))
          .digest("hex") === createHash("sha256").update(bytes).digest("hex");
      report.push(
        matches
          ? { ...item, status: "ja_migrado" }
          : { ...item, status: "pendente", reason: "arquivo_existente_divergente" },
      );
      continue;
    }
    if (!apply) {
      report.push({ ...item, status: "pronto" });
      continue;
    }
    const bytes = await readFile(row.file);
    if (bytes.length === 0 || bytes.length > MAX_FILE_BYTES) {
      report.push({ ...item, status: "pendente", reason: "tamanho_invalido" });
      continue;
    }
    const form = new FormData();
    form.append(
      "file",
      new Blob([bytes], { type: "application/x-pkcs12" }),
      path.basename(row.file),
    );
    const upload = await apiRequest(fetcher, certificateApi, token, `${row.certificate_id}/file`, {
      method: "POST",
      body: form,
    });
    if (upload.status !== 201) {
      report.push({ ...item, status: "pendente", reason: `upload_http_${upload.status}` });
      continue;
    }
    const download = await apiRequest(fetcher, certificateApi, token, `${row.certificate_id}/file`);
    const verified =
      download.ok &&
      createHash("sha256")
        .update(Buffer.from(await download.arrayBuffer()))
        .digest("hex") === createHash("sha256").update(bytes).digest("hex");
    report.push(
      verified
        ? { ...item, status: "migrado" }
        : { ...item, status: "pendente", reason: "download_nao_confere" },
    );
  }
  return report;
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dump = argument("--dump");
  const assets = argument("--assets");
  const output = argument("--report");
  if (!dump || !assets || !output) {
    throw new Error(
      "Uso: --dump <tb_certificados.pj.sql> --assets <diretorio> --report <json> [--certificate-api <url>] [--apply]",
    );
  }
  const handle = await open(output, "wx", 0o600);
  let report;
  try {
    report = await backfillLegacyCertificatePjFiles({
      dump,
      assets,
      certificateApi: argument("--certificate-api"),
      token: process.env.CERTIFICATE_MIGRATION_TOKEN,
      apply: process.argv.includes("--apply"),
    });
    await handle.writeFile(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    await handle.close();
  }
  const counts = Object.groupBy(report, ({ status }) => status);
  process.stdout.write(
    `${JSON.stringify(Object.fromEntries(Object.entries(counts).map(([key, value]) => [key, value.length])))}\n`,
  );
}
