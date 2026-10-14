import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createCommercialContractDraft,
  isCommercialContractEligible,
  renderCommercialContractTemplate,
} from "./utils/commercialContract.ts";

const client = {
  id: "client-123",
  dominio_code: null,
  status: "Ativo",
  prospecting_status: "Fechado",
  name: "Empresa <script>alert(1)</script>",
  company_name: "Empresa Exemplo Ltda.",
  fantasy_name: "Exemplo",
  cpf_cnpj: "12345678000190",
  address: "Rua Um",
  neighborhood: "Centro",
  city: "Feira de Santana",
  state: "BA",
  cep: "44000-000",
  number: "75999999999",
  email: "contato@example.com",
  responsible: "Pessoa Responsável",
  cpf_responsible: "12345678901",
  regime: "Simples Nacional",
  contabil: true,
  fiscal: false,
  pessoal: true,
  tecnologia: true,
};

assert.equal(isCommercialContractEligible(client), true);
assert.equal(
  isCommercialContractEligible({ ...client, prospecting_status: "Análise Financeira" }),
  true,
);
assert.equal(isCommercialContractEligible({ ...client, prospecting_status: "Paralisado" }), false);
assert.equal(
  isCommercialContractEligible({ ...client, prospecting_status: "Fechado" }, true),
  true,
);
assert.equal(
  isCommercialContractEligible({ ...client, prospecting_status: "Análise Financeira" }, true),
  false,
);
assert.equal(
  isCommercialContractEligible({ ...client, prospecting_status: "Recusado pelo Cliente" }),
  false,
);
assert.equal(isCommercialContractEligible({ ...client, prospecting_status: "Distrato" }), false);
assert.equal(isCommercialContractEligible({ ...client, status: "Inativo" }), false);
assert.equal(isCommercialContractEligible({ ...client, dominio_code: "REG-12" }), true);
assert.equal(
  isCommercialContractEligible({ ...client, dominio_code: "REG-12", status: "Inativo" }),
  false,
);

const draft = createCommercialContractDraft(client);
assert.equal(draft.clientName, "Empresa Exemplo Ltda.");
assert.equal(draft.document, "12345678000190");
assert.equal(draft.representativeName, "Pessoa Responsável");
assert.equal(draft.departments.contabil, true);
assert.equal(draft.departments.fiscal, false);
assert.equal(draft.departments.regularize, false);
assert.equal(draft.departments.tecnologia, true);
assert.equal(draft.percentages.mei, "");
assert.equal(draft.percentages.simplesNacional, "");

const template = readFileSync(
  new URL("./templates/commercial-contract-template.html", import.meta.url),
  "utf8",
);
assert.match(template, /CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE/);
const rendered = renderCommercialContractTemplate(
  {
    ...draft,
    clientName: "<img src=x onerror=alert(1)>",
    percentages: { ...draft.percentages, simplesNacional: "25,2" },
  },
  template,
);
assert.match(rendered, /&lt;img src=x onerror=alert\(1\)&gt;/);
assert.doesNotMatch(rendered, /<img src=x/);
assert.match(rendered, /25,2% do salário mínimo vigente/);
assert.match(rendered, /12\.345\.678\/0001-90/);
assert.doesNotMatch(rendered, /\{\{[^}]+\}\}/);
assert.doesNotMatch(rendered, /window\.localStorage|localStorage\.setItem/);
assert.doesNotMatch(rendered, /window\.location\.search|URLSearchParams/);

const source = readFileSync(
  new URL("../../pages/clients/[id]/contract.tsx", import.meta.url),
  "utf8",
);
assert.match(source, /contentWindow\?\.print\(\)/);
assert.doesNotMatch(source, /clientService\.(create|update)|useMutation/);
assert.match(source, /setupAPIClient\(ctx\)\.get\("\/user\/me"\)/);
assert.match(source, /resolveModuleAccess\([\s\S]*module: "comercial"/);
assert.match(
  source,
  /await import\(\s*"@modules\/commercial\/commercialContractTemplate\.server"\s*\)/,
);
assert.doesNotMatch(source, /import contractTemplate from/);
assert.match(source, /Cache-Control", "private, no-store/);
assert.doesNotMatch(source, /fetch\("\/commercial-contract-template\.html"/);

const clientDetailSource = readFileSync(
  new URL("../../pages/clients/[id].tsx", import.meta.url),
  "utf8",
);
assert.match(
  clientDetailSource,
  /isCommercialContractEligible\(client, isOrganizationOwner\(user\)\)/,
);

const templateSource = readFileSync(
  new URL("./templates/commercial-contract-template.html", import.meta.url),
  "utf8",
);
assert.match(templateSource, /class="contract-letterhead" src="\/commercial-letterhead\.png"/);
assert.doesNotMatch(templateSource, /background-image:\s*url\(\/commercial-letterhead\.png\)/);

console.log("commercial contract tests passed");
