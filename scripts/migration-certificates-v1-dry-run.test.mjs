import assert from "node:assert/strict";
import test from "node:test";

import { buildCertificateLoad, generatedId } from "./migration-certificates-v1-dry-run.mjs";

const organizationId = "org-test";

test("buildCertificateLoad maps legacy PJ and PF certificate rows to current schema", () => {
  const { load, quarantine } = buildCertificateLoad(
    {
      "tb_certificados.pj": [
        {
          id: 10,
          cliente: 1,
          nome: " EMPRESA TESTE LTDA  ",
          cnpj: "12.345.678/0001-99",
          responsavel: " Maria  Silva ",
          modelo: "A1",
          nj: "",
          senha: "secret-pj",
          validade: "2027-02-10",
          obs: "  observacao ",
          pagamento: 1,
          data_pagamento: "0000-00-00",
          valor_pagamento: 190,
          status: 1,
          contato: " 75999999999 ",
          arquivo: "legacy.pfx",
          possui: 1,
        },
      ],
      "tb_certificados.pf": [
        {
          id: 20,
          cliente: 0,
          nome: " Pessoa Teste ",
          cpf: " 123.456.789-01 ",
          modelo: "A3",
          senha: "secret-pf",
          validade: "2026-12-05",
          obs: "",
          empresa: " Empresa Vinculada ",
          cnpj: "98.765.432/0001-10",
          pagamento: 0,
          data_pagamento: "2025-01-09",
          valor_pagamento: 0,
          status: 0,
          contato: "",
          arquivo: "",
          possui: 0,
        },
      ],
    },
    { organizationId },
  );

  assert.deepEqual(quarantine, []);
  assert.deepEqual(load["certificate.pj"], [
    {
      id: generatedId("certificate.pj", 10),
      client_castelo_status: true,
      client_focus_status: false,
      name: "EMPRESA TESTE LTDA",
      cnpj: "12345678000199",
      responsible: "Maria Silva",
      model: "A1",
      legal_nature: "NAO INFORMADO",
      password: "secret-pj",
      expiration_date: "2027-02-10T00:00:00.000Z",
      notes: "observacao",
      was_paid: true,
      payment_date: null,
      payment_amount: 190,
      contact_info: "75999999999",
      has_certificate: true,
      organization_id: organizationId,
    },
  ]);
  assert.deepEqual(load["certificate.pf"], [
    {
      id: generatedId("certificate.pf", 20),
      client_castelo_status: false,
      client_focus_status: false,
      name: "Pessoa Teste",
      cpf: "12345678901",
      model: "A3",
      password: "secret-pf",
      expiration_date: "2026-12-05T00:00:00.000Z",
      notes: null,
      enterprise: "Empresa Vinculada",
      cnpj: "98765432000110",
      was_paid: false,
      payment_date: "2025-01-09T00:00:00.000Z",
      payment_amount: 0,
      contact_info: null,
      has_certificate: false,
      organization_id: organizationId,
    },
  ]);
});

test("buildCertificateLoad quarantines invalid required dates and duplicate identities", () => {
  const { load, quarantine } = buildCertificateLoad(
    {
      "tb_certificados.pj": [
        {
          id: 1,
          cliente: 1,
          nome: "Empresa Duplicada",
          cnpj: "111",
          responsavel: "",
          modelo: "A1",
          nj: "LTDA",
          senha: "",
          validade: "2027-01-01",
          obs: "",
          pagamento: 0,
          data_pagamento: "0000-00-00",
          valor_pagamento: 0,
          status: 1,
          contato: "",
          arquivo: "",
          possui: 1,
        },
        {
          id: 2,
          cliente: 1,
          nome: "Empresa Duplicada",
          cnpj: "111",
          responsavel: "",
          modelo: "A1",
          nj: "LTDA",
          senha: "",
          validade: "2027-01-01",
          obs: "",
          pagamento: 0,
          data_pagamento: "0000-00-00",
          valor_pagamento: 0,
          status: 1,
          contato: "",
          arquivo: "",
          possui: 1,
        },
      ],
      "tb_certificados.pf": [
        {
          id: 3,
          cliente: 0,
          nome: "Pessoa Sem Data",
          cpf: "",
          modelo: "A1",
          senha: "",
          validade: "0000-00-00",
          obs: "",
          empresa: "",
          cnpj: "",
          pagamento: 0,
          data_pagamento: "0000-00-00",
          valor_pagamento: 0,
          status: 1,
          contato: "",
          arquivo: "",
          possui: 0,
        },
      ],
    },
    { organizationId },
  );

  assert.equal(load["certificate.pj"].length, 1);
  assert.equal(load["certificate.pf"].length, 0);
  assert.deepEqual(
    quarantine.map((item) => ({
      table: item.table,
      legacy_id: item.legacy_id,
      reason: item.reason,
    })),
    [
      {
        table: "certificate.pj",
        legacy_id: 2,
        reason: "duplicate certificate identity",
      },
      {
        table: "certificate.pf",
        legacy_id: 3,
        reason: "invalid required expiration_date",
      },
    ],
  );
});
