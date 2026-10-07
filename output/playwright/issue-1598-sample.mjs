import { writeFileSync } from "node:fs";
import { renderGuidancePdf } from "../../services/regularize-service/src/services/guidancePdfService.ts";
const pdf = await renderGuidancePdf({
  id: "sample-guidance",
  target_type: "PJ",
  company_name: "ALFA SERVIÇOS LTDA",
  type: "ALTERAÇÃO CONTRATUAL",
  request: "ALTERAÇÃO CONTRATUAL - RAZÃO SOCIAL, CAPITAL SOCIAL, ATIVIDADES",
  framework_obs: "Alteração aprovada pelos sócios.",
  legal_nature: "Sociedade Empresária Limitada",
  trade_name: "Alfa Serviços",
  cpf_cnpj: "12345678000190",
  share_capital: 150000,
  iptu: "123456",
  carryng: "Microempresa",
  regime: "Simples Nacional",
  legal_representative: "Ana Silva",
  address: "Rua das Acácias, 100, Centro, Feira de Santana - BA",
  comporate_purpose: "Prestação de serviços administrativos e consultoria empresarial.",
  branch_data: { name: "Filial Centro", document: "12345678000271", address: "Rua B, 20", city: "Salvador", state: "BA" },
  economic_activities: [
    { type: "Principal", code: "8211-3/00", description: "Serviços combinados de escritório e apoio administrativo" },
    { type: "Secundária", code: "7020-4/00", description: "Atividades de consultoria em gestão empresarial" },
  ],
  partners: [{ name: "Ana Silva", percentage: 60, profession: "Empresária", marital_status: "Casada", rg: "1234567", cpf: "12345678901", address: "Rua C, 30", role: "Administradora" }],
});
writeFileSync("output/playwright/issue-1598-orientacao-amostra.pdf", pdf);
