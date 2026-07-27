import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function readSource(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

const fiscalSources = {
  ncmSection: readSource("./components/FiscalNcmSection.tsx"),
  icmsSection: readSource("./components/FiscalIcmsSection.tsx"),
  ipiSection: readSource("./components/FiscalIpiSection.tsx"),
  queryKeys: readSource("./hooks/queryKeys.ts"),
  ncmHook: readSource("./hooks/useFiscalNcmList.ts"),
  icmsHook: readSource("./hooks/useFiscalIcmsList.ts"),
  ipiHook: readSource("./hooks/useFiscalIpiList.ts"),
  contract: readSource("./services/fiscalService.contract.ts"),
  types: readSource("./types/index.ts"),
  ncmSchema: readSource("../../../../services/fiscal-service/src/schemas/ncm.schemas.ts"),
  icmsSchema: readSource("../../../../services/fiscal-service/src/schemas/icms.schemas.ts"),
  ipiSchema: readSource("../../../../services/fiscal-service/src/schemas/ipi.schemas.ts"),
  ncmRoute: readSource("../../../../services/fiscal-service/src/routes/ncm.routes.ts"),
  icmsRoute: readSource("../../../../services/fiscal-service/src/routes/icms.routes.ts"),
  ipiRoute: readSource("../../../../services/fiscal-service/src/routes/ipi.routes.ts"),
  ncmService: readSource("../../../../services/fiscal-service/src/services/ncmService.ts"),
  icmsService: readSource("../../../../services/fiscal-service/src/services/icmsService.ts"),
  ipiService: readSource("../../../../services/fiscal-service/src/services/ipiService.ts"),
};

runTest("fiscal list hooks stay enabled for initial paginated listing", () => {
  for (const source of [fiscalSources.ncmHook, fiscalSources.icmsHook, fiscalSources.ipiHook]) {
    assert.doesNotMatch(source, /enabled:\s*enabled\s*&&[\s\S]*length\s*>\s*0/);
    assert.match(source, /page_size/);
    assert.match(source, /ListResult/);
  }
});

runTest("fiscal list params include pagination and preserve current query", () => {
  assert.match(fiscalSources.types, /PaginatedResult/);
  assert.doesNotMatch(fiscalSources.queryKeys, /\.join\("\|"\)/);
  assert.match(fiscalSources.queryKeys, /\[\.\.\.\(filters\.ncmCodes \?\? \[\]\)\]/);
  assert.match(fiscalSources.queryKeys, /\[\.\.\.\(filters\.icmsCodes \?\? \[\]\)\]/);
  assert.match(fiscalSources.queryKeys, /\[\.\.\.\(filters\.ipiCodes \?\? \[\]\)\]/);
  for (const builder of [
    "buildFiscalNcmListParams",
    "buildFiscalIcmsListParams",
    "buildFiscalIpiListParams",
  ]) {
    const match = fiscalSources.contract.match(new RegExp(`function ${builder}[\\s\\S]*?\\n}`));
    const body = match?.[0] ?? "";
    assert.match(body, /page:\s*filters\.page/);
    assert.match(body, /page_size:\s*filters\.page_size/);
  }
  assert.match(fiscalSources.contract, /normalizePaginatedResult/);
});

runTest("fiscal sections list on open, debounce search, clear search and paginate", () => {
  for (const source of [fiscalSources.ncmSection, fiscalSources.icmsSection, fiscalSources.ipiSection]) {
    assert.doesNotMatch(source, /hasSubmittedSearch/);
    assert.match(source, /useEffect/);
    assert.match(source, /setTimeout/);
    assert.match(source, /PaginationControls/);
    assert.match(source, /setPage\(\(currentPage\) => currentPage \+ 1\)/);
    assert.match(source, /setFilterValue\(""\)/);
  }
  assert.doesNotMatch(fiscalSources.ipiSection, /NCM_CODE_LENGTH|\\d\{8\}/);
});

runTest("fiscal tables use centered headers, balanced cells and icon-only edit actions", () => {
  for (const source of [fiscalSources.ncmSection, fiscalSources.icmsSection, fiscalSources.ipiSection]) {
    assert.match(source, /Pencil/);
    assert.match(source, /py-2\.5 text-center text-\[11px\] font-semibold uppercase/);
    assert.match(source, /text-sm leading-5/);
    assert.match(source, /align-middle hover:bg-gray-50/);
    assert.match(source, /ACTION_BUTTON_CLASSNAME =\s*\n\s*"inline-flex h-8 w-8/);
    assert.match(source, /aria-label=\{`Editar/);
    assert.match(source, /<Pencil className="h-3\.5 w-3\.5"/);
    assert.doesNotMatch(source, />\s*Editar\s*<\/button>/);
  }
  assert.match(fiscalSources.ncmSection, />\s*Tributação\s*</);
  assert.match(fiscalSources.ncmSection, />\s*Início\s*</);
  assert.match(fiscalSources.ncmSection, />\s*Fim\s*</);
  assert.match(fiscalSources.ncmSection, />\s*Ação\s*</);
  assert.match(fiscalSources.ncmSection, /w-\[12%\][\s\S]*w-\[26%\][\s\S]*w-\[18%\][\s\S]*w-\[16%\][\s\S]*w-\[11%\][\s\S]*w-\[10%\][\s\S]*w-\[7%\]/);
  assert.match(fiscalSources.ncmSection, /:\s*"Sem fim"/);
  assert.match(fiscalSources.icmsSection, />\s*Conv\.\s*</);
  assert.match(fiscalSources.icmsSection, />\s*MVA apl\.\s*</);
  assert.match(fiscalSources.icmsSection, /w-\[8%\][\s\S]*w-\[24%\][\s\S]*w-\[10%\][\s\S]*w-\[10%\][\s\S]*w-\[16%\][\s\S]*w-\[9%\][\s\S]*w-\[9%\][\s\S]*w-\[8%\][\s\S]*w-\[6%\]/);
  assert.match(fiscalSources.ipiSection, />\s*Alíq\.\s*</);
  assert.match(fiscalSources.ipiSection, /w-\[24%\][\s\S]*w-\[12%\][\s\S]*w-\[38%\][\s\S]*w-\[16%\][\s\S]*w-\[10%\]/);
});

runTest("fiscal-service list schemas accept optional terms and pagination", () => {
  for (const source of [fiscalSources.ncmSchema, fiscalSources.icmsSchema, fiscalSources.ipiSchema]) {
    assert.match(source, /paginationQuerySchema/);
    assert.match(source, /commaSeparatedListSchema/);
    assert.doesNotMatch(source, /\.min\(1, .*obrigat/);
  }
});

runTest("fiscal-service list routes pass pagination and optional search terms", () => {
  for (const source of [fiscalSources.ncmRoute, fiscalSources.icmsRoute, fiscalSources.ipiRoute]) {
    assert.match(source, /page:\s*req\.query\.page/);
    assert.match(source, /page_size:\s*req\.query\.page_size/);
    assert.match(source, /service\.list\(\s*\{[\s\S]*page:\s*query\.page[\s\S]*page_size:\s*query\.page_size/);
  }
});

runTest("fiscal-service lists use partial search and paginated result metadata", () => {
  for (const source of [fiscalSources.ncmService, fiscalSources.icmsService, fiscalSources.ipiService]) {
    assert.match(source, /count\(\{ where \}\)/);
    assert.match(source, /contains/);
    assert.match(source, /mode:\s*"insensitive"/);
    assert.match(source, /skip,\s*\n\s*take,/);
    assert.match(source, /hasMore:\s*page \* take < total/);
  }
});
