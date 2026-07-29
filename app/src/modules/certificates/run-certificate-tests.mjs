import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  buildCertificateFileFormData,
  buildCertificateListPage,
  buildCertificateListParams,
  CERTIFICATE_ENDPOINTS,
  isAcceptedCertificateFileName,
  parseCertificateFilename,
  unwrapCertificateEnvelope,
} from "./services/certificateService.contract.ts";

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

runTest("certificate endpoints match gateway public contract", () => {
  assert.equal(CERTIFICATE_ENDPOINTS.pjList, "/certificate/pj/list");
  assert.equal(CERTIFICATE_ENDPOINTS.pjCreate, "/certificate/pj");
  assert.equal(CERTIFICATE_ENDPOINTS.pjDetail("id-1"), "/certificate/pj/id-1");
  assert.equal(CERTIFICATE_ENDPOINTS.pjFile("id-1"), "/certificate/pj/id-1/file");
  assert.equal(CERTIFICATE_ENDPOINTS.pfList, "/certificate/pf/list");
  assert.equal(CERTIFICATE_ENDPOINTS.pfCreate, "/certificate/pf");
  assert.equal(CERTIFICATE_ENDPOINTS.pfDetail("id-1"), "/certificate/pf/id-1");
  assert.equal(CERTIFICATE_ENDPOINTS.pfFile("id-1"), "/certificate/pf/id-1/file");
  assert.equal(CERTIFICATE_ENDPOINTS.notifications, "/certificate/notifications");
});

runTest("buildCertificateListParams removes empty values", () => {
  assert.deepEqual(
    buildCertificateListParams({
      page: 2,
      page_size: 25,
      name: "",
      cnpj: "123",
      has_certificate: false,
      was_paid: undefined,
    }),
    {
      page: 2,
      page_size: 25,
      cnpj: "123",
      has_certificate: false,
    },
  );
});

runTest("buildCertificateListPage infers hasMore from page size", () => {
  const items = [{ id: "1" }];
  assert.deepEqual(buildCertificateListPage(items, { page: 2, page_size: 1 }), {
    data: items,
    page: 2,
    page_size: 1,
    hasMore: true,
  });
});

runTest("buildCertificateListPage falls back to default page and page_size", () => {
  const items = [{ id: "1" }];
  assert.equal(buildCertificateListPage(items).page, 1);
  assert.equal(buildCertificateListPage(items).page_size, 20);
  assert.equal(buildCertificateListPage(items).hasMore, false);
});

runTest("buildCertificateFileFormData sends file in multipart field", () => {
  const file = new Blob([new Uint8Array([1, 2, 3])], { type: "application/octet-stream" });
  const formData = buildCertificateFileFormData(file);

  const savedFile = formData.get("file");
  assert.ok(savedFile instanceof Blob);
  assert.equal(savedFile.size, file.size);
});

runTest("isAcceptedCertificateFileName allows only pfx and p12 files", () => {
  assert.equal(isAcceptedCertificateFileName("cliente.pfx"), true);
  assert.equal(isAcceptedCertificateFileName("cliente.P12"), true);
  assert.equal(isAcceptedCertificateFileName("cliente.txt"), false);
  assert.equal(isAcceptedCertificateFileName("cliente.pfx.txt"), false);
  assert.equal(isAcceptedCertificateFileName(""), false);
});

runTest("parseCertificateFilename falls back when header is absent", () => {
  assert.equal(
    parseCertificateFilename(undefined, "certificado.pfx"),
    "certificado.pfx",
  );
});

runTest("parseCertificateFilename extracts quoted filename", () => {
  const header = 'attachment; filename="certificado-123.pfx"';

  assert.equal(parseCertificateFilename(header, "certificado.pfx"), "certificado-123.pfx");
});

runTest("parseCertificateFilename decodes RFC5987 filename", () => {
  const header = "attachment; filename*=UTF-8''certificado%20seguro.pfx";
  assert.equal(parseCertificateFilename(header, "certificado.pfx"), "certificado seguro.pfx");
});

runTest("unwrapCertificateEnvelope extracts data from success envelope", () => {
  const payload = { id: "1", name: "A" };
  assert.deepEqual(unwrapCertificateEnvelope({ success: true, data: payload }), payload);
  assert.deepEqual(unwrapCertificateEnvelope(payload), payload);
});

runTest("issue 495 certificate notes preserve line breaks and wrap long tokens", () => {
  const source = readFileSync(new URL("./components/CertificatesWorkspace.tsx", import.meta.url), "utf8");

  for (const detailName of ["pjDetail", "pfDetail"]) {
    const notesDisplay =
      source.match(
        new RegExp(
          `<p className="[^"]*">\\s*\\{${detailName}\\?\\.notes \\?\\? "Sem observações\\."\\}\\s*<\\/p>`,
        ),
      )?.[0] ?? "";

    assert.match(notesDisplay, /whitespace-pre-wrap/);
    assert.match(notesDisplay, /break-words/);
  }
});

runTest("certificate refresh keeps rows while a new first page is requested", () => {
  const workspaceSource = readFileSync(
    new URL("./components/CertificatesWorkspace.tsx", import.meta.url),
    "utf8",
  );

  assert.match(workspaceSource, /pjListQuery\.isPlaceholderData/);
  assert.match(workspaceSource, /pjListQuery\.data\.page !== pjPage/);
  assert.match(workspaceSource, /pfListQuery\.isPlaceholderData/);
  assert.match(workspaceSource, /pfListQuery\.data\.page !== pfPage/);
  assert.match(workspaceSource, /notificationsQuery\.isPlaceholderData/);
  assert.match(workspaceSource, /notificationsQuery\.data\.page !== notificationPage/);
  assert.match(workspaceSource, /const activeListIsLoading = activeTab === "pf"\n    \? pfListQuery\.isFetching/);
  assert.doesNotMatch(workspaceSource, /setVisiblePjItems\(\[\]\);\n      void pjListQuery\.refetch\(\);/);
  assert.doesNotMatch(workspaceSource, /setVisiblePfItems\(\[\]\);\n      void pfListQuery\.refetch\(\);/);
  assert.match(
    workspaceSource,
    /if \(activeTab === "notifications"[\s\S]*setNotificationPage\(FIRST_PAGE\)/,
  );
});

console.log("certificates contract tests passed");
