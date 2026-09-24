import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  formatCpfCnpjInput,
  validateCpfCnpjDocument,
  validateOptionalCpfDocument,
} from "./utils/documentValidation.ts";
import {
  buildRegularizePayload,
  createRegularizeInitialValues,
} from "./utils/regularizeForm.ts";
import { mapClientStatusFromApi, mapClientStatusToApi } from "./utils/statusMapper.ts";

function runTest(name, fn) {
  fn();
  console.log(`PASS ${name}`);
}

runTest("document validation accepts valid CPF/CNPJ and rejects invalid check digits", () => {
  assert.equal(validateCpfCnpjDocument("529.982.247-25"), null);
  assert.equal(validateCpfCnpjDocument("12.345.678/0001-95"), null);
  assert.equal(validateCpfCnpjDocument("529.982.247-26", "PF"), "CPF inválido.");
  assert.equal(validateCpfCnpjDocument("12.345.678/0001-00", "PJ"), "CNPJ inválido.");
  assert.equal(validateCpfCnpjDocument("111.111.111-11", "PF"), "CPF inválido.");
});

runTest("document validation preserves alphanumeric CNPJ support and optional CPF rules", () => {
  assert.equal(formatCpfCnpjInput("AB123456780001", "PJ"), "AB.123.456/7800-01");
  assert.equal(validateCpfCnpjDocument("AB.123.456/7800-26", "PJ"), null);
  assert.equal(validateOptionalCpfDocument("CPF do responsável", ""), null);
  assert.equal(validateOptionalCpfDocument("CPF do responsável", "529.982.247-25"), null);
  assert.equal(
    validateOptionalCpfDocument("CPF do responsável", "529.982.247-26"),
    "CPF do responsável inválido.",
  );
});

runTest("regularization preserves normalized alphanumeric CNPJ and masked hydration", () => {
  const client = {
    type: "PJ",
    name: "Acme",
    cpf_cnpj: "12.345.678/0001-95",
    number: "11999999999",
  };
  const initialValues = createRegularizeInitialValues(client);
  const values = {
    ...initialValues,
    cpf_cnpj: "AB.123.456/7800-26",
  };

  assert.equal(initialValues.cpf_cnpj, "12.345.678/0001-95");
  assert.deepEqual(buildRegularizePayload(values, client), {
    cpf_cnpj: "AB123456780026",
  });
});

runTest("status mapping and client list/detail contracts remain aligned", () => {
  assert.equal(mapClientStatusFromApi("Prospecção"), "Prospect");
  assert.equal(mapClientStatusToApi("Prospect"), "Prospecção");

  const clients = readFileSync("src/shared/components/newLayout/Clients.tsx", "utf8");
  const detail = readFileSync("src/pages/clients/[id].tsx", "utf8");
  const pagination = readFileSync("src/shared/components/ui/PaginationControls.tsx", "utf8");

  assert.match(clients, /onCreated=\{\(client\) => void router\.push\(`\/clients\/\$\{client\.id\}`\)\}/);
  assert.match(detail, /formatCpfCnpjInput/);
  assert.match(detail, /showDocumentError=\{showDocumentError\}/);
  assert.match(pagination, /Mostrando \{range\.start\} a \{range\.end\} de \{total\}/);
});

runTest("PF regularization controls expose fixed options, field errors, and optional father", () => {
  const controls = readFileSync("src/modules/regularize/components/regularizeFormControls.tsx", "utf8");
  const form = readFileSync("src/modules/regularize/components/RegularizeClientPfForm.tsx", "utf8");
  const schema = readFileSync(
    "../services/regularize-service/src/schemas/clientPf.schemas.ts",
    "utf8",
  );

  assert.match(controls, /regularizeClientPfSexOptions/);
  assert.match(controls, /regularizeClientPfMaritalStatusOptions/);
  assert.match(controls, /regularizeClientPfStateOptions/);
  assert.match(form, /Gerado automaticamente para novos clientes PF/);
  assert.match(form, /aria-invalid=\{Boolean\(fieldErrors\./);
  assert.match(form, /sticky=\{false\}/);
  assert.match(schema, /father: z\.string\(\)\.optional\(\)\.default\(""\)/);
});
