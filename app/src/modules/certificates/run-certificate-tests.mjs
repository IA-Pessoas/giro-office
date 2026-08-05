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
  unwrapCertificateList,
} from "./services/certificateService.contract.ts";
import {
  certificateNotificationsQueryKey,
  certificatePfListQueryKey,
  certificatePjListQueryKey,
} from "./hooks/queryKeys.ts";
import * as certificateWorkspaceUi from "./components/certificateWorkspaceUi.ts";
import {
  getCreatePfPayload,
  getCreatePjPayload,
  getPaymentAmountValidationError,
  getUpdatePfPayload,
  getUpdatePjPayload,
  normalizeCertificateDocumentFilter,
} from "./components/certificateInputNormalization.ts";

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

runTest("certificate row sorting orders dates without mutating the source", () => {
  const rows = [
    { id: "late", expiration_date: "2026-12-31" },
    { id: "early", expiration_date: "2025-01-01" },
    { id: "middle", expiration_date: "2026-01-01" },
  ];

  assert.deepEqual(
    certificateWorkspaceUi
      .sortCertificateRows(rows, (row) => Date.parse(row.expiration_date), "asc")
      .map((row) => row.id),
    ["early", "middle", "late"],
  );
  assert.deepEqual(
    certificateWorkspaceUi
      .sortCertificateRows(rows, (row) => Date.parse(row.expiration_date), "desc")
      .map((row) => row.id),
    ["late", "middle", "early"],
  );
  assert.deepEqual(rows.map((row) => row.id), ["late", "early", "middle"]);
});

runTest("certificate row sorting compares text and boolean values", () => {
  const rows = [
    { id: "without-file", name: "Zeta", has_certificate: false },
    { id: "with-file", name: "Alpha", has_certificate: true },
  ];

  assert.deepEqual(
    certificateWorkspaceUi
      .sortCertificateRows(rows, (row) => row.name, "asc")
      .map((row) => row.id),
    ["with-file", "without-file"],
  );
  assert.deepEqual(
    certificateWorkspaceUi
      .sortCertificateRows(rows, (row) => row.has_certificate, "asc")
      .map((row) => row.id),
    ["without-file", "with-file"],
  );
});

runTest("certificate tables expose sortable headers and active sort state", () => {
  const workspaceSource = readFileSync(
    new URL("./components/CertificatesWorkspace.tsx", import.meta.url),
    "utf8",
  );

  assert.match(workspaceSource, /function SortableTableHeader/);
  assert.match(workspaceSource, /aria-sort=/);
  assert.equal((workspaceSource.match(/sortKey="expiration_date"/g) ?? []).length, 2);
  assert.match(workspaceSource, /sortedPjItems\.map/);
  assert.match(workspaceSource, /sortedPfItems\.map/);
  assert.match(workspaceSource, /sortedNotificationItems\.map/);
});

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

runTest("certificate service exposes full-record deletion for PJ and PF", () => {
  const serviceSource = readFileSync(
    new URL("./services/certificateService.ts", import.meta.url),
    "utf8",
  );

  assert.match(
    serviceSource,
    /async deletePj\(id: string\)[\s\S]*?api\.delete\(CERTIFICATE_ENDPOINTS\.pjDetail\(id\)\)/,
  );
  assert.match(
    serviceSource,
    /async deletePf\(id: string\)[\s\S]*?api\.delete\(CERTIFICATE_ENDPOINTS\.pfDetail\(id\)\)/,
  );
});

runTest("certificate deletion mutations invalidate lists and details", () => {
  const hooksSource = readFileSync(
    new URL("./hooks/useCertificates.ts", import.meta.url),
    "utf8",
  );

  assert.match(hooksSource, /useDeleteCertificatePjMutation/);
  assert.match(hooksSource, /useDeleteCertificatePfMutation/);
  assert.match(hooksSource, /certificateService\.deletePj/);
  assert.match(hooksSource, /certificateService\.deletePf/);
  assert.match(
    hooksSource,
    /useDeleteCertificatePjMutation[\s\S]*?CERTIFICATE_QUERY_KEY[\s\S]*?certificatePjDetailQueryKey/,
  );
  assert.match(
    hooksSource,
    /useDeleteCertificatePfMutation[\s\S]*?CERTIFICATE_QUERY_KEY[\s\S]*?certificatePfDetailQueryKey/,
  );
});

runTest("certificate workspace requests table record deletion through the shared confirmation", () => {
  const workspaceSource = readFileSync(
    new URL("./components/CertificatesWorkspace.tsx", import.meta.url),
    "utf8",
  );

  assert.match(workspaceSource, /useDeleteCertificatePjMutation/);
  assert.match(workspaceSource, /useDeleteCertificatePfMutation/);
  assert.match(workspaceSource, /Trash2/);
  assert.match(workspaceSource, /<ConfirmationDialog/);
  assert.doesNotMatch(workspaceSource, /window\.confirm/);
  assert.match(workspaceSource, /const \[pendingDeletion, setPendingDeletion\] = useState<PendingCertificateDeletion \| null>\(null\)/);
  assert.match(workspaceSource, /setPendingDeletion\(\{ kind: "pj", certificate \}\)/);
  assert.match(workspaceSource, /setPendingDeletion\(\{ kind: "pf", certificate \}\)/);
  assert.match(workspaceSource, /async function handleConfirmPendingDeletion\(\)/);
  assert.match(workspaceSource, /await deletePjMutation\.mutateAsync\(\{ id: certificate\.id \}\)/);
  assert.match(workspaceSource, /await deletePfMutation\.mutateAsync\(\{ id: certificate\.id \}\)/);
  assert.match(workspaceSource, /toast\.success\("Certificado/);
  assert.match(workspaceSource, /toast\.error\(/);
  assert.match(workspaceSource, /canManageCertificateModule &&/);
  assert.match(workspaceSource, /cancelLabel="Cancelar"/);
  assert.match(workspaceSource, /confirmLabel="Excluir certificado"/);
  assert.match(workspaceSource, /Esta ação remove o cadastro e o arquivo associado, quando existir\./);
});

runTest("certificate workspace shows PF and PJ details in a shared dialog", () => {
  const workspaceSource = readFileSync(
    new URL("./components/CertificatesWorkspace.tsx", import.meta.url),
    "utf8",
  );
  const detailDialogBlock =
    workspaceSource.match(/<Dialog[\s\S]*?open=\{shouldShowDetailDialog\}[\s\S]*?<\/Dialog>/)?.[0] ?? "";
  const startEditSelectedBlock =
    workspaceSource.match(/function handleStartEditSelected\(\) \{[\s\S]*?\n  \}/)?.[0] ?? "";

  assert.match(
    workspaceSource,
    /const shouldShowDetailDialog = Boolean\(selected\) && !isFormMode;/,
  );
  assert.match(workspaceSource, /function handleCloseDetailDialog\(\) \{/);
  assert.match(
    workspaceSource,
    /const detailDialogTitle = selected\?\.type === "pj"[\s\S]*?"Detalhe do certificado PJ"[\s\S]*?"Detalhe do certificado PF";/,
  );
  assert.match(
    workspaceSource,
    /const detailDialogDescription = selected\?\.type === "pj"[\s\S]*?"Dados completos do certificado PJ selecionado\."[\s\S]*?"Dados completos do certificado PF selecionado\.";/,
  );
  assert.match(
    workspaceSource,
    /function handleCloseDetailDialog\(\) \{[\s\S]*?setSelected\(null\);[\s\S]*?setWorkspaceMode\("view"\);[\s\S]*?setShowDetailPassword\(false\);[\s\S]*?\}/,
  );
  assert.match(
    workspaceSource,
    /function handleDetailDialogOpenChange\(open: boolean\) \{[\s\S]*?if \(open\) \{[\s\S]*?return;[\s\S]*?\}[\s\S]*?handleCloseDetailDialog\(\);[\s\S]*?\}/,
  );
  assert.ok(detailDialogBlock, "bloco do Dialog de detalhe não encontrado");
  assert.match(detailDialogBlock, /open=\{shouldShowDetailDialog\}/);
  assert.match(detailDialogBlock, /onOpenChange=\{handleDetailDialogOpenChange\}/);
  assert.match(detailDialogBlock, /title=\{detailDialogTitle\}/);
  assert.match(detailDialogBlock, /description=\{detailDialogDescription\}/);
  assert.match(
    detailDialogBlock,
    /\{activeDetailIsLoading \? \([\s\S]*?\{activeDetailErrorMessage \? \([\s\S]*?selected\?\.type === "pj"[\s\S]*?selected\?\.type === "pf"/,
  );
  assert.match(detailDialogBlock, /renderPasswordBlock\(pjDetail\?\.password\)/);
  assert.match(detailDialogBlock, /renderPasswordBlock\(pfDetail\?\.password\)/);
  assert.match(detailDialogBlock, /<CertificateFileActions[\s\S]*?kind="pj"/);
  assert.match(detailDialogBlock, /<CertificateFileActions[\s\S]*?kind="pf"/);
  assert.ok(startEditSelectedBlock, "handler de edição não encontrado");
  assert.match(startEditSelectedBlock, /setWorkspaceMode\("editPj"\)/);
  assert.match(startEditSelectedBlock, /setWorkspaceMode\("editPf"\)/);
  assert.doesNotMatch(startEditSelectedBlock, /setSelected\(null\)/);
  assert.doesNotMatch(workspaceSource, /const shouldShowDetailPanel = Boolean\(selected\);/);
  assert.doesNotMatch(
    workspaceSource,
    /\{shouldShowDetailPanel \? \(\s*<section className=\{`\$\{CERTIFICATE_PANEL_CLASSNAME\} space-y-4`\}>/,
  );
});

runTest("certificate record deletion uses the shared confirmation dialog", () => {
  const clientSource = readFileSync(new URL("./services/certificateService.ts", import.meta.url), "utf8");
  const actionsSource = readFileSync(
    new URL("./components/CertificateFileActions.tsx", import.meta.url),
    "utf8",
  );

  assert.match(clientSource, /async deletePj\(id: string\): Promise<void>/);
  assert.match(clientSource, /async deletePf\(id: string\): Promise<void>/);
  assert.match(actionsSource, /<ConfirmationDialog/);
  assert.doesNotMatch(actionsSource, /import \{ Dialog \}/);
  assert.doesNotMatch(actionsSource, /window\.confirm/);
  assert.match(actionsSource, /isRecordDeleteDialogOpen/);
  assert.match(actionsSource, /handleDeleteRecord/);
  assert.match(actionsSource, /isDeletingRecord/);
  assert.match(actionsSource, /onDeleteRecordSuccess/);
  assert.match(actionsSource, /Excluir certificado/);
  assert.match(actionsSource, /cancelLabel="Cancelar"/);
  assert.match(actionsSource, /confirmLabel="Excluir certificado"/);
  assert.match(actionsSource, /Esta ação remove o cadastro e o arquivo associado, quando existir\./);
});

runTest("certificate record confirmation isolates file operation errors", () => {
  const actionsSource = readFileSync(
    new URL("./components/CertificateFileActions.tsx", import.meta.url),
    "utf8",
  );

  assert.match(actionsSource, /const \[recordDeleteError, setRecordDeleteError\] = useState<string \| null>\(null\)/);
  assert.match(
    actionsSource,
    /function handleOpenRecordDeleteDialog\(\) \{\s*setRecordDeleteError\(null\);\s*setIsRecordDeleteDialogOpen\(true\);\s*\}/,
  );
  assert.match(actionsSource, /onClick=\{handleOpenRecordDeleteDialog\}/);
  assert.match(
    actionsSource,
    /async function handleDeleteRecord\(\) \{[\s\S]*?setRecordDeleteError\(null\);[\s\S]*?catch \(error\) \{[\s\S]*?setRecordDeleteError\(message\);[\s\S]*?throw error;/,
  );
  assert.match(actionsSource, /errorMessage=\{recordDeleteError\}/);
  assert.doesNotMatch(actionsSource, /errorMessage=\{localError \|\| null\}/);
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
    total: 1,
    page: 2,
    page_size: 1,
    hasMore: true,
  });
});

runTest("buildCertificateListPage falls back to default page and page_size", () => {
  const items = [{ id: "1" }];
  assert.equal(buildCertificateListPage(items).page, 1);
  assert.equal(buildCertificateListPage(items).page_size, 20);
  assert.equal(buildCertificateListPage(items).total, 1);
  assert.equal(buildCertificateListPage(items).hasMore, false);
});

runTest("certificate list contract preserves server pagination metadata", () => {
  const items = [{ id: "1" }];

  assert.deepEqual(
    unwrapCertificateList(
      {
        success: true,
        data: {
          items,
          total: 41,
          page: 2,
          page_size: 20,
          has_more: true,
        },
      },
      { page: 2, page_size: 20 },
    ),
    {
      data: items,
      total: 41,
      page: 2,
      page_size: 20,
      hasMore: true,
    },
  );
});

runTest("certificate workspace uses full pagination controls", () => {
  const source = readFileSync(
    new URL("./components/CertificatesWorkspace.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /<PaginationControls/);
  assert.match(source, /totalPages/);
  assert.doesNotMatch(source, /Carregar mais/);
});

runTest("certificate PJ query key defaults omitted page_size to 20", () => {
  assert.equal(certificatePjListQueryKey({ page: 2 })[4], 20);
});

runTest("certificate PF query key defaults omitted page_size to 20", () => {
  assert.equal(certificatePfListQueryKey({ page: 2 })[4], 20);
});

runTest("certificate notifications query key defaults omitted page_size to 20", () => {
  assert.equal(certificateNotificationsQueryKey({ page: 2 })[4], 20);
});

runTest("certificate list query keys preserve explicit page_size", () => {
  assert.equal(certificatePjListQueryKey({ page_size: 35 })[4], 35);
  assert.equal(certificatePfListQueryKey({ page_size: 35 })[4], 35);
  assert.equal(certificateNotificationsQueryKey({ page_size: 35 })[4], 35);
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

runTest("certificate pagination reads the active server page", () => {
  const workspaceSource = readFileSync(
    new URL("./components/CertificatesWorkspace.tsx", import.meta.url),
    "utf8",
  );

  assert.match(workspaceSource, /const pjItems = pjListQuery\.data\?\.data \?\? \[\];/);
  assert.match(workspaceSource, /const pfItems = pfListQuery\.data\?\.data \?\? \[\];/);
  assert.match(workspaceSource, /const notificationItems = notificationsQuery\.data\?\.data \?\? \[\];/);
  assert.match(workspaceSource, /pjListQuery\.isPlaceholderData/);
  assert.match(workspaceSource, /pfListQuery\.isPlaceholderData/);
  assert.match(workspaceSource, /notificationsQuery\.isPlaceholderData/);
  assert.match(workspaceSource, /const activeListIsLoading = activeTab === "pf"\n    \? pfListQuery\.isFetching/);
  assert.match(workspaceSource, /onFirst=\{\(\) => setActivePage\(FIRST_PAGE\)\}/);
  assert.match(workspaceSource, /onLast=\{\(\) => setActivePage\(activeTotalPages\)\}/);
  assert.match(
    workspaceSource,
    /if \(activeTab === "notifications"[\s\S]*setNotificationPage\(FIRST_PAGE\)/,
  );
});

runTest("certificate filters reset their server page", () => {
  const workspaceSource = readFileSync(
    new URL("./components/CertificatesWorkspace.tsx", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(workspaceSource, /useRef/);
  assert.match(workspaceSource, /setPjPage\(FIRST_PAGE\)/);
  assert.match(workspaceSource, /setPfPage\(FIRST_PAGE\)/);
});

const certificateFileActionsSource = readFileSync(
  "src/modules/certificates/components/CertificateFileActions.tsx",
  "utf8",
);
const certificatesWorkspaceSource = readFileSync(
  "src/modules/certificates/components/CertificatesWorkspace.tsx",
  "utf8",
);

runTest("ações de arquivo inline não duplicam a exclusão do certificado", () => {
  const inlineBlock = certificateFileActionsSource.match(
    /if \(variant === "inline"\) \{([\s\S]*?)\n  \}\n\n  return \(/,
  )?.[1];
  const panelBlock = certificateFileActionsSource.match(/\n  return \(([\s\S]*?)\n\}\n$/)?.[1];

  assert.ok(inlineBlock, "bloco inline não encontrado");
  assert.ok(panelBlock, "bloco panel não encontrado");
  assert.doesNotMatch(inlineBlock, /Remover arquivo/);
  assert.doesNotMatch(inlineBlock, /CERTIFICATE_TABLE_DANGER_ACTION_BUTTON_CLASSNAME/);
  assert.match(panelBlock, /canDeleteFile/);
  assert.match(panelBlock, /Remover/);
  assert.match(panelBlock, /canDeleteRecord/);
  assert.match(panelBlock, /Excluir certificado/);
});

runTest("Viewer de certificados pode consultar sem receber ações de escrita", () => {
  assert.equal(
    typeof certificateWorkspaceUi.resolveCertificateWorkspaceCapabilities,
    "function",
  );
  assert.deepEqual(
    certificateWorkspaceUi.resolveCertificateWorkspaceCapabilities({
      canView: true,
      canEdit: false,
      isAdmin: false,
    }),
    {
      canReadRecords: true,
      canManageRecords: false,
      canManageFiles: false,
      canDeleteRecords: false,
      canDeleteFiles: false,
    },
  );
  assert.deepEqual(
    certificateWorkspaceUi.resolveCertificateWorkspaceCapabilities({
      canView: true,
      canEdit: true,
      isAdmin: false,
    }),
    {
      canReadRecords: true,
      canManageRecords: true,
      canManageFiles: true,
      canDeleteRecords: true,
      canDeleteFiles: false,
    },
  );
  assert.deepEqual(
    certificateWorkspaceUi.resolveCertificateWorkspaceCapabilities({
      canView: true,
      canEdit: true,
      isAdmin: true,
    }),
    {
      canReadRecords: true,
      canManageRecords: true,
      canManageFiles: true,
      canDeleteRecords: true,
      canDeleteFiles: true,
    },
  );
});

runTest("workspace aplica a mesma política de acesso nas consultas e ações", () => {
  assert.match(
    certificatesWorkspaceSource,
    /resolveCertificateWorkspaceCapabilities\(access\)/,
  );
  assert.match(
    certificatesWorkspaceSource,
    /const shouldFetchCertificates =\s*certificateCapabilities\.canReadRecords &&\s*!isModuleAccessLoading/,
  );
  assert.match(
    certificatesWorkspaceSource,
    /enabled: shouldFetchCertificates && activeTab === "pj"/,
  );
  assert.match(
    certificatesWorkspaceSource,
    /enabled: shouldFetchCertificates && activeTab === "pf"/,
  );
  assert.equal(
    (
      certificatesWorkspaceSource.match(
        /canEdit=\{certificateCapabilities\.canManageFiles\}/g,
      ) ?? []
    ).length,
    4,
  );
  assert.equal(
    (
      certificatesWorkspaceSource.match(
        /canDeleteFile=\{certificateCapabilities\.canDeleteFiles\}/g,
      ) ?? []
    ).length,
    4,
  );
  assert.equal(
    (
      certificatesWorkspaceSource.match(
        /canDeleteRecord=\{certificateCapabilities\.canDeleteRecords\}/g,
      ) ?? []
    ).length,
    4,
  );
});

runTest("separa permissao de edicao e remocao de arquivos", () => {
  assert.match(certificateFileActionsSource, /canDeleteFile: boolean/);
  assert.match(certificateFileActionsSource, /canDeleteRecord: boolean/);
  assert.match(certificateFileActionsSource, /\{canDeleteFile \?/);
  assert.match(certificateFileActionsSource, /\{canDeleteRecord \?/);
  assert.equal(
    (
      certificatesWorkspaceSource.match(
        /canDeleteFile=\{certificateCapabilities\.canDeleteFiles\}/g,
      ) ?? []
    ).length,
    4,
  );
});

runTest("certificate required fields are disclosed only while creating", () => {
  const source = readFileSync(new URL("./components/CertificateForm.tsx", import.meta.url), "utf8");

  assert.match(source, /RequiredFieldLabel/);
  assert.match(source, /<RequiredFieldLabel[\s\S]*required=\{isCreate\}/);
  assert.match(source, /aria-required=\{isCreate\}/);
  assert.match(source, /isPj \? "CNPJ" : "CPF"/);
  assert.match(source, /function hasText\(value: string\): boolean/);
});

runTest("certificate form masks documents, BRL, and contact phones", () => {
  const source = readFileSync(new URL("./components/CertificateForm.tsx", import.meta.url), "utf8");

  assert.match(
    source,
    /import \{[\s\S]*formatBrazilianPhoneInput,[\s\S]*formatBrlInput,[\s\S]*formatCnpjInput,[\s\S]*formatCpfInput,[\s\S]*\} from "@shared\/utils\/inputFormatting"/,
  );
  assert.match(source, /getCreatePjPayload/);
  assert.match(source, /getCreatePfPayload/);
  assert.match(source, /getUpdatePjPayload/);
  assert.match(source, /getUpdatePfPayload/);
  assert.match(source, /formatBrazilianPhoneInput/);
  assert.match(
    source,
    /contactInfo: formatBrazilianPhoneInput\(initialPj\?\.contact_info \?\? ""\)/,
  );
  assert.match(
    source,
    /contactInfo: formatBrazilianPhoneInput\(initialPf\?\.contact_info \?\? ""\)/,
  );
  assert.match(
    source,
    /updateField\("contactInfo", formatBrazilianPhoneInput\(event\.target\.value\)\)/,
  );
  assert.match(source, /updateField\("paymentAmount", formatBrlInput\(event\.target\.value\)\)/);
});

runTest("certificate payment validation distinguishes empty from invalid BRL input", () => {
  assert.equal(getPaymentAmountValidationError("", true), null);
  assert.equal(getPaymentAmountValidationError("R$ 12,34", true), null);
  assert.equal(
    getPaymentAmountValidationError("9007199254740992", true),
    "Informe um valor de pagamento válido.",
  );
  assert.equal(
    getPaymentAmountValidationError("valor inválido", true),
    "Informe um valor de pagamento válido.",
  );
  assert.equal(getPaymentAmountValidationError("9007199254740992", false), null);
});

runTest("certificate workspace formats document filters and sends digit-only query parameters", () => {
  const source = readFileSync(
    new URL("./components/CertificatesWorkspace.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /normalizeCertificateDocumentFilter\(pjFilters\.cnpj\)/);
  assert.match(source, /normalizeCertificateDocumentFilter\(pfFilters\.cpf\)/);
  assert.match(source, /normalizeCertificateDocumentFilter\(pfFilters\.cnpj\)/);
  assert.match(source, /cnpj: formatCnpjInput\(event\.target\.value\)/);
  assert.match(source, /cpf: formatCpfInput\(event\.target\.value\)/);
});

runTest("certificate payload builders normalize masked documents, BRL amounts, and contact phones", () => {
  const pjPayload = getCreatePjPayload({
    kind: "pj",
    clientCasteloStatus: true,
    clientFocusStatus: false,
    name: " Cliente PJ ",
    cnpj: "12.345.678/0001-90",
    responsible: " Responsável ",
    model: " A1 ",
    legalNature: " LTDA ",
    password: " segredo ",
    expirationDate: "2026-12-31",
    notes: " nota ",
    wasPaid: true,
    paymentDate: "2026-01-02",
    paymentAmount: "R$ 1.234,56",
    contactInfo: "(11) 99999-9999",
  });
  const pfPayload = getCreatePfPayload({
    kind: "pf",
    clientCasteloStatus: false,
    clientFocusStatus: true,
    name: " Cliente PF ",
    cpf: "123.456.789-01",
    enterprise: " Empresa ",
    model: " A3 ",
    cnpj: "12.345.678/0001-90",
    password: " segredo ",
    expirationDate: "2026-12-31",
    notes: "",
    wasPaid: true,
    paymentDate: "2026-01-02",
    paymentAmount: "",
    contactInfo: "(11) 99999-9999",
  });

  assert.equal(pjPayload.cnpj, "12345678000190");
  assert.equal(pjPayload.payment_amount, 1234.56);
  assert.equal(pjPayload.contact_info, "11999999999");
  assert.equal(pfPayload.cpf, "12345678901");
  assert.equal(pfPayload.cnpj, "12345678000190");
  assert.equal(pfPayload.payment_amount, null);
  assert.equal(pfPayload.contact_info, "11999999999");
});

runTest("certificate update builders ignore document mask-only changes and normalize contact phones", () => {
  const pjState = {
    kind: "pj",
    clientCasteloStatus: false,
    clientFocusStatus: false,
    name: "Cliente",
    cnpj: "12.345.678/0001-90",
    responsible: "Responsável",
    model: "A1",
    legalNature: "LTDA",
    password: "",
    expirationDate: "2026-12-31",
    notes: "",
    wasPaid: false,
    paymentDate: "",
    paymentAmount: "",
    contactInfo: "",
  };
  const pfState = {
    kind: "pf",
    clientCasteloStatus: false,
    clientFocusStatus: false,
    name: "Cliente",
    cpf: "123.456.789-01",
    enterprise: "",
    model: "A1",
    cnpj: "12.345.678/0001-90",
    password: "",
    expirationDate: "2026-12-31",
    notes: "",
    wasPaid: false,
    paymentDate: "",
    paymentAmount: "",
    contactInfo: "",
  };

  assert.equal(getUpdatePjPayload(pjState, { ...pjState, cnpj: "12345678000190" }), null);
  assert.equal(
    getUpdatePfPayload(pfState, { ...pfState, cpf: "12345678901", cnpj: "12345678000190" }),
    null,
  );
  assert.deepEqual(
    getUpdatePjPayload({ ...pjState, contactInfo: "(11) 99999-9999" }, pjState),
    { contact_info: "11999999999" },
  );
  assert.deepEqual(
    getUpdatePfPayload({ ...pfState, contactInfo: "(11) 99999-9999" }, pfState),
    { contact_info: "11999999999" },
  );
});

runTest("certificate document filters normalize masked values and omit empty inputs", () => {
  assert.equal(normalizeCertificateDocumentFilter("12.345.678/0001-90"), "12345678000190");
  assert.equal(normalizeCertificateDocumentFilter("123.456.789-01"), "12345678901");
  assert.equal(normalizeCertificateDocumentFilter(" .-/ "), undefined);
});

runTest("certificate Focus and Castelo statuses remain explicit and independent", () => {
  const formSource = readFileSync(new URL("./components/CertificateForm.tsx", import.meta.url), "utf8");
  const workspaceSource = readFileSync(
    new URL("./components/CertificatesWorkspace.tsx", import.meta.url),
    "utf8",
  );

  assert.match(formSource, /CERTIFICATE_STATUS_OPTIONS/);
  assert.match(workspaceSource, /CERTIFICATE_STATUS_FILTER_OPTIONS/);
  assert.match(workspaceSource, /label: "Regularizado"/);
  assert.match(workspaceSource, /label: "[^"]*regularizado"/i);

  for (const statusName of ["Castelo", "Focus"]) {
    assert.match(formSource, new RegExp(`Situa\\u00e7\\u00e3o ${statusName}`));
    assert.match(workspaceSource, new RegExp(`Situa\\u00e7\\u00e3o ${statusName}`));
    assert.match(
      workspaceSource,
      new RegExp(`Situa\\u00e7\\u00e3o ${statusName}: \\{certificateStatusLabel\\(Boolean\\((pjDetail|pfDetail)\\?\\.client_`),
    );
  }

  const pjState = {
    kind: "pj",
    clientCasteloStatus: false,
    clientFocusStatus: false,
    name: "Cliente",
    cnpj: "12345678000190",
    responsible: "Responsavel",
    model: "A1",
    legalNature: "LTDA",
    password: "",
    expirationDate: "2026-12-31",
    notes: "",
    wasPaid: false,
    paymentDate: "",
    paymentAmount: "",
    contactInfo: "",
  };
  const pfState = {
    kind: "pf",
    clientCasteloStatus: false,
    clientFocusStatus: false,
    name: "Cliente",
    cpf: "12345678901",
    enterprise: "",
    model: "A1",
    cnpj: "",
    password: "",
    expirationDate: "2026-12-31",
    notes: "",
    wasPaid: false,
    paymentDate: "",
    paymentAmount: "",
    contactInfo: "",
  };

  assert.deepEqual(
    getUpdatePjPayload({ ...pjState, clientFocusStatus: true }, pjState),
    { client_focus_status: true },
  );
  assert.deepEqual(
    getUpdatePjPayload({ ...pjState, clientCasteloStatus: true }, pjState),
    { client_castelo_status: true },
  );
  assert.deepEqual(
    getUpdatePfPayload({ ...pfState, clientFocusStatus: true }, pfState),
    { client_focus_status: true },
  );
  assert.deepEqual(
    getUpdatePfPayload({ ...pfState, clientCasteloStatus: true }, pfState),
    { client_castelo_status: true },
  );
});

console.log("certificates contract tests passed");
