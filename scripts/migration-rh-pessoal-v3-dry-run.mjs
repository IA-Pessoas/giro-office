import crypto from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    if (process.env[key]) continue;
    let value = trimmed.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadEnvFile(path.join(ROOT, ".env"));
loadEnvFile(path.join(ROOT, "infra", ".env"));
loadEnvFile(path.join(ROOT, "services", "pessoal-service", ".env"));

const SOURCE_DIR = process.env.LEGACY_DUMP_DIR ?? "/home/bruno/Documents/06.07.2026";
const OUT_DIR = process.env.MIGRATION_OUT_DIR ?? "/tmp/giro-office-rh-pessoal-v3-dry-run";
const ORGANIZATION_ID =
  process.env.MIGRATION_ORGANIZATION_ID ?? "e8048d1c-0830-45d7-84de-68e20abd685b";
const GENERATED_NAMESPACE =
  process.env.MIGRATION_GENERATED_NAMESPACE ?? "3f68d246-0b54-4a10-9415-a8845a767fb5";
const RECONCILE_CURRENT_IDS = process.env.MIGRATION_RECONCILE_CURRENT_IDS === "1";
const ENCRYPT_PESSOAL_PASSWORDS = process.env.MIGRATION_ENCRYPT_PESSOAL_PASSWORDS === "1";
const PESSOAL_PASSWORD_ENCRYPTION_KEY = process.env.PESSOAL_PASSWORD_ENCRYPTION_KEY;
const PESSOAL_PASSWORD_ENCRYPTION_KEY_VERSION =
  process.env.PESSOAL_PASSWORD_ENCRYPTION_KEY_VERSION ?? "v1";
const CONTROLLED_CURRENT_USER_ID_OVERRIDES = new Map([
  [
    "241",
    {
      currentId: "40cd0661-4855-590d-bf4a-a8e17261bcfa",
      legacyLogin: "Bruno Silva",
      currentLogin: "Bruno Santana",
      reason: "login alterado diretamente no banco atual antes da migracao",
    },
  ],
]);
const CONTROLLED_CURRENT_CLIENT_ID_OVERRIDES = new Map([
  [
    "1172",
    {
      currentId: "9dff7b63-7606-5b10-ba20-13e54e435281",
      legacyName: "GL EMPORIO LTDA",
      document: "52350073000107",
      reason: "cliente ativo duplicado no tenant atual; autorizado migrar para cadastro ativo",
    },
  ],
  [
    "1183",
    {
      currentId: "f905ef99-bc64-57f0-8585-f913a97cf0c4",
      legacyName: "TB STUDIO DE PILATES LTDA",
      document: "21511297000120",
      reason: "cliente ativo duplicado no tenant atual; autorizado migrar para cadastro ativo",
    },
  ],
  [
    "1184",
    {
      currentId: "74493d9c-db79-59ca-a1ce-874dec70d517",
      legacyName: "MERCADO LR LTDA",
      document: "40299015000117",
      reason: "cliente ativo duplicado no tenant atual; autorizado migrar para cadastro ativo",
    },
  ],
  [
    "1185",
    {
      currentId: "078c1e6f-eca1-58a8-b94c-b78895c0064e",
      legacyName: "A MODERNA TECIDOS LTDA",
      document: "42337863000107",
      reason:
        "cliente ativo duplicado no tenant atual; escolhido cadastro ativo com codigo Dominio",
    },
  ],
  [
    "1196",
    {
      currentId: "e5825a4c-a712-51dc-bdf5-c02c541da80f",
      legacyName: "J S A DOS SANTOS",
      document: "44671443000180",
      reason:
        "cliente ativo duplicado no tenant atual; escolhido cadastro ativo com codigo Dominio",
    },
  ],
  [
    "1198",
    {
      currentId: "4b7f54f5-8bdb-5dba-8675-a3d4afb01a4e",
      legacyName: "RD CONSULTORIA EM PUBLICIDADE LTDA",
      document: "33535035000184",
      reason: "cliente ativo duplicado no tenant atual; autorizado migrar para cadastro ativo",
    },
  ],
  [
    "1223",
    {
      currentId: "2e72e557-2ca6-59f9-8a6f-9a64a98f2b12",
      legacyName: "DECORY COMERCIO LTDA",
      document: "49791740000182",
      reason:
        "cliente ativo duplicado no tenant atual; escolhido cadastro ativo com email preenchido",
    },
  ],
  [
    "1232",
    {
      currentId: "4632ad3c-2533-5bdc-91d5-92271b1b6152",
      legacyName: "CHAI ODONTOLOGIA LTDA",
      document: "57287170000116",
      reason:
        "cliente ativo duplicado no tenant atual; escolhido cadastro ativo com codigo Dominio",
    },
  ],
  [
    "7",
    {
      currentId: "8278c016-7af2-5279-88a7-7e525faefbe1",
      legacyName: "BAR E RESTAURANTE STOP NIL LTDA",
      document: "38039300000157",
      reason: "cliente inativo duplicado no tenant atual; autorizado migrar para cadastro inativo",
    },
  ],
  [
    "52",
    {
      currentId: "f3143ae7-b23d-5fea-9780-2eb6adfbda47",
      legacyName: "SABRINA HAIR DESIGNER LTDA",
      document: "26444744000199",
      reason: "cliente inativo duplicado no tenant atual; autorizado migrar para cadastro inativo",
    },
  ],
  [
    "87",
    {
      currentId: "e9bf275d-4e98-53d8-a01c-31823619b9c3",
      legacyName: "COMERCIAL RL TRINDADE LTDA",
      document: "45070245000123",
      reason: "cliente inativo duplicado no tenant atual; autorizado migrar para cadastro inativo",
    },
  ],
  [
    "94",
    {
      currentId: "afd2c035-7b76-5685-b029-dc52a3ea3c7d",
      legacyName: "RESTAURANTE KI-MUKEKA LTDA",
      document: "47429066000165",
      reason: "cliente inativo duplicado no tenant atual; autorizado migrar para cadastro inativo",
    },
  ],
  [
    "95",
    {
      currentId: "34207089-9082-5fe5-a56e-1a131e1d616e",
      legacyName: "BEATRIZ SILVA DE JESUS 09398475588",
      document: "43482339000184",
      reason: "cliente inativo duplicado no tenant atual; autorizado migrar para cadastro inativo",
    },
  ],
  [
    "110",
    {
      currentId: "7c5aff09-714c-5c07-80fb-05eabf92ce92",
      legacyName: "PRINCESA DA FAZENDA RESTAURANTE LTDA",
      document: "14728277000140",
      reason: "cliente inativo duplicado no tenant atual; autorizado migrar para cadastro inativo",
    },
  ],
  [
    "119",
    {
      currentId: "4d05ce80-05d7-5fa9-94ae-61e75f90338a",
      legacyName: "FLOR DE SAL GASTROBAR LTDA",
      document: "24798185000190",
      reason: "cliente inativo duplicado no tenant atual; autorizado migrar para cadastro inativo",
    },
  ],
  [
    "280",
    {
      currentId: "c8dc5e07-071a-559e-9c94-6c1676d93712",
      legacyName: "LCDS TRANSPORTES LTDA",
      document: "22663227000150",
      reason: "cliente inativo duplicado no tenant atual; autorizado migrar para cadastro inativo",
    },
  ],
  [
    "303",
    {
      currentId: "661bcc4a-f134-53f1-aa15-f0ebd96b307b",
      legacyName: "OTICAS VALE DO PARAMIRIM LTDA",
      document: "23487006000130",
      reason: "cliente inativo duplicado no tenant atual; autorizado migrar para cadastro inativo",
    },
  ],
  [
    "343",
    {
      currentId: "1d7cd8f8-8f73-5ca8-b9d3-3b0abe8b6a83",
      legacyName: "DAYANE ELENA COSTA FIUZA ME",
      document: "12919722000123",
      reason: "cliente inativo duplicado no tenant atual; autorizado migrar para cadastro inativo",
    },
  ],
  [
    "429",
    {
      currentId: "0031981c-93f5-5816-98d2-544d3abfd26e",
      legacyName: "LOOK CERTO CONFECÇOES LTDA",
      document: "26915898000111",
      reason: "cliente inativo duplicado no tenant atual; autorizado migrar para cadastro inativo",
    },
  ],
  [
    "464",
    {
      currentId: "13d529ad-fbb5-551f-a332-759dac72ae98",
      legacyName: "MEU DENTE CLINICA ODONTOLOGICA LTDA",
      document: "21385908000130",
      reason: "cliente inativo duplicado no tenant atual; autorizado migrar para cadastro inativo",
    },
  ],
  [
    "477",
    {
      currentId: "ba42c11b-97fa-52bc-b159-d86766e23990",
      legacyName: "BRASDIESEL SERVICO E COMERCIO DE PECAS LTDA",
      document: "48345930000103",
      reason: "cliente inativo duplicado no tenant atual; autorizado migrar para cadastro inativo",
    },
  ],
  [
    "484",
    {
      currentId: "f5db9ffd-fcfe-597a-afcb-206bd05307f0",
      legacyName: "EURIDES DO CARMO REIS 02947062590",
      document: "31418322000189",
      reason: "cliente inativo duplicado no tenant atual; autorizado migrar para cadastro inativo",
    },
  ],
  [
    "534",
    {
      currentId: "89f0de2b-0542-5040-beba-e511c37abb45",
      legacyName: "FINAGEST GESTAO FINANCEIRA LTDA",
      document: "48565038000138",
      reason: "cliente inativo duplicado no tenant atual; autorizado migrar para cadastro inativo",
    },
  ],
  [
    "566",
    {
      currentId: "68d6a55a-3310-5cf4-8101-51b7e3d96579",
      legacyName: "PLANEJAR CONSULTORIA EMPRESARIAL LTDA",
      document: "37859707000168",
      reason: "cliente inativo duplicado no tenant atual; autorizado migrar para cadastro inativo",
    },
  ],
  [
    "608",
    {
      currentId: "326b6370-c49f-5534-b758-bdfe177b4e25",
      legacyName: "SPARK INTELIGENCIA CORPORATIVA LTDA",
      document: "49358983000121",
      reason: "cliente inativo duplicado no tenant atual; autorizado migrar para cadastro inativo",
    },
  ],
  [
    "660",
    {
      currentId: "3c8cbffe-8785-584e-a0bd-9c7ea0b424ca",
      legacyName: "24HORAS BATERIAS LTDA",
      document: "39981636000105",
      reason: "cliente inativo duplicado no tenant atual; autorizado migrar para cadastro inativo",
    },
  ],
  [
    "685",
    {
      currentId: "04a06cd7-95a6-549f-ba1a-f86522d42761",
      legacyName: "COLEGIO PRIMICIAS LTDA",
      document: "36748121000163",
      reason: "cliente inativo duplicado no tenant atual; autorizado migrar para cadastro inativo",
    },
  ],
  [
    "765",
    {
      currentId: "a7250c78-ba60-5aa5-8ec0-5f66e605fd5d",
      legacyName: "JERONIMO DE JESUS RODRIGUES",
      document: "13688135000133",
      reason: "cliente inativo duplicado no tenant atual; autorizado migrar para cadastro inativo",
    },
  ],
  [
    "769",
    {
      currentId: "dc502acd-923e-503c-ad28-f6697b57c6a1",
      legacyName: "NILTON CEZAR ALMEIDA LIMA",
      document: "31469835000119",
      reason: "cliente inativo duplicado no tenant atual; autorizado migrar para cadastro inativo",
    },
  ],
  [
    "775",
    {
      currentId: "56a0dd0c-baa1-5ead-a206-c8d43d4eb362",
      legacyName: "VAREJO HUB LTDA",
      document: "26611906000136",
      reason: "cliente inativo duplicado no tenant atual; autorizado migrar para cadastro inativo",
    },
  ],
  [
    "895",
    {
      currentId: "0473a489-d607-5c58-baac-972d2e986b70",
      legacyName: "EDMUNDO FLORENTINO DE SOUZA FILHO",
      document: "12213587000104",
      reason: "cliente inativo duplicado no tenant atual; autorizado migrar para cadastro inativo",
    },
  ],
  [
    "899",
    {
      currentId: "9522483f-b3e5-5dd6-84b6-dbd07e7f7654",
      legacyName: "FAP SERVICOS ODONTOLOGICOS LTDA",
      document: "38404537000190",
      reason: "cliente inativo duplicado no tenant atual; autorizado migrar para cadastro inativo",
    },
  ],
  [
    "902",
    {
      currentId: "c6de7f12-6b6d-5fa6-8a0b-017ea242178a",
      legacyName: "GERALDO EDSON MASCARENHAS E IRMAOS",
      document: "17941032520",
      reason: "cliente inativo duplicado no tenant atual; autorizado migrar para cadastro inativo",
    },
  ],
  [
    "907",
    {
      currentId: "132bd62a-db61-54a0-b145-8df24d9c4ba2",
      legacyName: "J C SISTEMAS E SEGURANCA ELETRONICA LTDA",
      document: "18375643000266",
      reason: "cliente inativo duplicado no tenant atual; autorizado migrar para cadastro inativo",
    },
  ],
  [
    "911",
    {
      currentId: "1bdb9a51-890c-5128-9e1f-31d06fb6bb12",
      legacyName: "CLAUDIVONE COSMÉTICOS LTDA",
      document: "31964945000157",
      reason: "cliente inativo duplicado no tenant atual; autorizado migrar para cadastro inativo",
    },
  ],
  [
    "913",
    {
      currentId: "c8910eb3-95f0-51f9-bc63-b89d8a2fd719",
      legacyName: "JOVELE COMERCIO E SERVICO LTDA",
      document: "10299906000102",
      reason: "cliente inativo duplicado no tenant atual; autorizado migrar para cadastro inativo",
    },
  ],
  [
    "914",
    {
      currentId: "a3d7d9a2-64a3-5b98-b2df-ec2ffe34913f",
      legacyName: "MARABIA DE MATOS BRASSER ME",
      document: "28713953000116",
      reason: "cliente inativo duplicado no tenant atual; autorizado migrar para cadastro inativo",
    },
  ],
  [
    "916",
    {
      currentId: "aba0a03f-dcee-5d5b-91a4-1be7df68cb9d",
      legacyName: "MONTSEG ADMINISTRADORA E CORRETORA DE SEGUROS LTDA",
      document: "30234167000188",
      reason: "cliente inativo duplicado no tenant atual; autorizado migrar para cadastro inativo",
    },
  ],
  [
    "918",
    {
      currentId: "dc5dfea3-ba60-5534-8240-d87bde42c0d1",
      legacyName: "P&P COMERCIO DE EXTINTORES LTDA",
      document: "46039133000172",
      reason: "cliente inativo duplicado no tenant atual; autorizado migrar para cadastro inativo",
    },
  ],
  [
    "920",
    {
      currentId: "401d9857-58dc-5013-b8d7-6739d38ac049",
      legacyName: "RAFAEL MORAES DE OLIVEIRA",
      document: "26401534000113",
      reason: "cliente inativo duplicado no tenant atual; autorizado migrar para cadastro inativo",
    },
  ],
  [
    "932",
    {
      currentId: "2a1f430f-ec46-55e1-bf42-f9e0ac623d9d",
      legacyName: "29.360.236 LAYLA COSTA ARGOLLO",
      document: "29360236000110",
      reason: "cliente inativo duplicado no tenant atual; autorizado migrar para cadastro inativo",
    },
  ],
  [
    "1078",
    {
      currentId: "ed4baa62-5267-5ba6-88a9-3513b5aed7af",
      legacyName: "ALEXSANDRO OLIVEIRA SOUZA",
      document: "62306162549",
      reason: "cliente inativo duplicado no tenant atual; autorizado migrar para cadastro inativo",
    },
  ],
  [
    "4",
    {
      currentId: "e320bbf6-32fa-5e58-ab86-bbfdc8656a8b",
      legacyName: "ALESSANDRO SILVA FERREIRA 04072631523",
      document: "36220923000104",
      reason:
        "cliente duplicado no tenant atual; escolhido cadastro com codigo Dominio unico (624)",
    },
  ],
  [
    "12",
    {
      currentId: "a9a8a2e2-9368-5794-bf6b-cf39f8c39f2a",
      legacyName: "CENTRO AUTOMOTIVO RF EIRELI",
      document: "23937064000119",
      reason:
        "cliente duplicado no tenant atual; escolhido cadastro com codigo Dominio unico (359)",
    },
  ],
  [
    "24",
    {
      currentId: "cbb3d3c1-3d30-50c6-97ec-0922bdb43163",
      legacyName: "FILEMOM GOMES PRODUTOS DIGITAIS LTDA",
      document: "37700844000155",
      reason:
        "cliente duplicado no tenant atual; escolhido cadastro com codigo Dominio unico (610)",
    },
  ],
  [
    "108",
    {
      currentId: "784d29dd-e574-5d0a-b876-08a14ef6e23c",
      legacyName: "MARCOS SOUZA DOS SANTOS 04886948502",
      document: "45459924000199",
      reason:
        "cliente duplicado no tenant atual; escolhido cadastro com codigo Dominio unico (682)",
    },
  ],
  [
    "113",
    {
      currentId: "36a8c4a3-61d6-5406-8534-5132377c7cfe",
      legacyName: "PRIMMUS PROVEDOR DE ACESSO A INTERNET LTDA",
      document: "10825188000160",
      reason:
        "cliente duplicado no tenant atual; escolhido cadastro com codigo Dominio unico (294)",
    },
  ],
  [
    "295",
    {
      currentId: "296cb992-8013-5a2a-87c8-ca8a7239e8f7",
      legacyName: "RESTAURANTE A. MORAIS LTDA",
      document: "47676675000119",
      reason:
        "cliente duplicado no tenant atual; escolhido cadastro com codigo Dominio unico (771)",
    },
  ],
  [
    "302",
    {
      currentId: "31d7e533-f2b4-542b-9fb4-3ee831159f7f",
      legacyName: "ARENA BEACH TENNIS FEIRA LTDA",
      document: "46716824000163",
      reason:
        "cliente duplicado no tenant atual; escolhido cadastro com codigo Dominio unico (735)",
    },
  ],
  [
    "347",
    {
      currentId: "39f156d0-a828-52b9-93e8-f8445355b1ec",
      legacyName: "FABIANO DO COCO LTDA",
      document: "47216796000188",
      reason:
        "cliente duplicado no tenant atual; escolhido cadastro com codigo Dominio unico (755)",
    },
  ],
  [
    "673",
    {
      currentId: "52fcd588-4fe7-5a83-8db7-6d516c1bcdeb",
      legacyName: "F M R SERVICOS AUTOMOTIVOS LTDA",
      document: "37167268000122",
      reason:
        "cliente duplicado no tenant atual; escolhido cadastro com codigo Dominio unico (1041)",
    },
  ],
  [
    "732",
    {
      currentId: "f2f46f81-f786-572d-962d-4185ee2e8805",
      legacyName: "CHARLES REPRESENTACOES LTDA",
      document: "10208505000108",
      reason: "cliente duplicado no tenant atual; escolhido cadastro com codigo Dominio unico (16)",
    },
  ],
  [
    "763",
    {
      currentId: "1104f691-11d6-5499-b667-537334e329fe",
      legacyName: "KENIO RAMOS PIMENTEL 87725797572",
      document: "36273161000104",
      reason:
        "cliente duplicado no tenant atual; escolhido cadastro com codigo Dominio unico (498)",
    },
  ],
  [
    "815",
    {
      currentId: "a307a91f-88cc-50e0-9b0d-870d48e72084",
      legacyName: "PLUG TECNOLOGIAS E TELECOMUNICACOES LTDA",
      document: "50840451000105",
      reason:
        "cliente duplicado no tenant atual; escolhido cadastro com codigo Dominio unico (874)",
    },
  ],
  [
    "915",
    {
      currentId: "cbb2b24d-03cb-5454-9a5e-ad074c799852",
      legacyName: "MH HOLDING LTDA",
      document: "40827852000171",
      reason:
        "cliente duplicado no tenant atual; escolhido cadastro com codigo Dominio unico (593)",
    },
  ],
  [
    "922",
    {
      currentId: "f912dd7d-aadc-55e7-adb4-89d6c9fbd06f",
      legacyName: "ROGERIO CARLOS CEDRAZ DA SILVA 922480395",
      document: "37769249000176",
      reason:
        "cliente duplicado no tenant atual; escolhido cadastro com codigo Dominio unico (417)",
    },
  ],
  [
    "1201",
    {
      currentId: "5724869f-e1cd-553e-ae45-f785eb97742c",
      legacyName: "TAMIRES BIAO PILATES LTDA",
      document: "52643514000169",
      reason:
        "cliente duplicado no tenant atual; escolhido cadastro com codigo Dominio unico (905)",
    },
  ],
]);

const SOURCE_TABLES = [
  "tb_admin.usuarios",
  "tb_admin.departamentos",
  "tb_admin.permissoes_rh",
  "tb_admin.permissoes_pessoal",
  "tb_integracao.clientes",
  "tb_rh.alergias",
  "tb_rh.andares",
  "tb_rh.cargos",
  "tb_rh.cce",
  "tb_rh.cce_avaliacoes",
  "tb_rh.colaboradores",
  "tb_rh.colaboradores_atas",
  "tb_rh.contatos_emergencia",
  "tb_rh.feedbacks",
  "tb_rh.feriados",
  "tb_rh.ferias_datas",
  "tb_rh.ferias_periodos",
  "tb_rh.intercorrencias",
  "tb_rh.intercorrencias_tipos",
  "tb_rh.pontos",
  "tb_rh.pontos_adicionais_folhas",
  "tb_rh.pontos_folhas",
  "tb_rh.pontos_registros",
  "tb_rh.pontos_solicitacoes",
  "tb_rh.provas",
  "tb_rh.provas_inscritos",
  "tb_rh.provas_questoes",
  "tb_rh.provas_respostas",
  "tb_rh.pv",
  "tb_rh.pv_objetivos",
  "tb_rh.pv_tarefas",
  "tb_rh.pv_tarefas_express",
  "tb_rh.score",
  "tb_rh.score_avaliacoes",
  "tb_rh.score_nitro",
  "tb_rh.score_nitro.avaliacoes",
  "tb_rh.score_nitro.avaliacoes_periodos",
  "tb_rh.score_nitro.ch",
  "tb_rh.score_nitro.erros",
  "tb_rh.score_perguntas",
  "tb_rh.solicitacoes",
  "tb_rh.solicitacoes_categorias",
  "tb_rh.solicitacoes_mensagens",
  "tb_pessoal.atividades",
  "tb_pessoal.bem",
  "tb_pessoal.bsf",
  "tb_pessoal.clientes_situacoes",
  "tb_pessoal.codigos_acesso",
  "tb_pessoal.contri_assis",
  "tb_pessoal.empregador_web",
  "tb_pessoal.folhas",
  "tb_pessoal.grupos",
  "tb_pessoal.ldd",
  "tb_pessoal.obrigacoes",
  "tb_pessoal.sindicato",
];

const QUARANTINE_ONLY = new Set([
  "tb_rh.andares",
  "tb_rh.cce",
  "tb_rh.cce_avaliacoes",
  "tb_rh.colaboradores_atas",
  "tb_rh.feedbacks",
  "tb_rh.ferias_datas",
  "tb_rh.ferias_periodos",
  "tb_rh.intercorrencias",
  "tb_rh.intercorrencias_tipos",
  "tb_rh.provas",
  "tb_rh.provas_inscritos",
  "tb_rh.provas_questoes",
  "tb_rh.provas_respostas",
  "tb_rh.pv",
  "tb_rh.pv_objetivos",
  "tb_rh.pv_tarefas",
  "tb_rh.pv_tarefas_express",
]);

function uuidv5(name, namespace) {
  const ns = Buffer.from(namespace.replaceAll("-", ""), "hex");
  const hash = crypto.createHash("sha1").update(ns).update(Buffer.from(name, "utf8")).digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const value = hash.subarray(0, 16).toString("hex");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function generatedId(scope, legacyId) {
  return uuidv5(`${scope}:${legacyId}`, GENERATED_NAMESPACE);
}

function cleanText(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).replace(/\s+/g, " ").trim();
  return text.length > 0 ? text : null;
}

function decodePessoalPasswordEncryptionKey() {
  if (!ENCRYPT_PESSOAL_PASSWORDS) return null;
  if (!PESSOAL_PASSWORD_ENCRYPTION_KEY) {
    throw new Error("PESSOAL_PASSWORD_ENCRYPTION_KEY nao definida para criptografar senhas.");
  }
  const key = Buffer.from(PESSOAL_PASSWORD_ENCRYPTION_KEY, "base64");
  if (key.length !== 32) {
    throw new Error("PESSOAL_PASSWORD_ENCRYPTION_KEY deve ter 32 bytes em base64.");
  }
  if (!PESSOAL_PASSWORD_ENCRYPTION_KEY_VERSION.trim()) {
    throw new Error("PESSOAL_PASSWORD_ENCRYPTION_KEY_VERSION invalida.");
  }
  return key;
}

const pessoalPasswordEncryptionKey = decodePessoalPasswordEncryptionKey();

function encodePessoalPasswordSecret(value) {
  const text = cleanText(value);
  if (text === null) return null;
  if (!ENCRYPT_PESSOAL_PASSWORDS) return "<redacted:requiresEncryption>";

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", pessoalPasswordEncryptionKey, iv);
  const data = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return JSON.stringify({
    v: PESSOAL_PASSWORD_ENCRYPTION_KEY_VERSION.trim(),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: data.toString("base64"),
  });
}

function requiredText(value, fallback = "-") {
  return cleanText(value) ?? fallback;
}

function digits(value) {
  return requiredText(value, "").replace(/\D/g, "");
}

function normalizeKey(value) {
  return requiredText(value, "").normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
}

function nullableLegacyDate(value) {
  const text = cleanText(value);
  if (!text || text.startsWith("0000-00-00")) return null;
  return text;
}

function legacyDatePart(value) {
  const text = nullableLegacyDate(value);
  return text?.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? null;
}

function boolLegacy(value) {
  return Number(value ?? 0) === 1;
}

function parseScalar(raw) {
  const trimmed = raw.trim();
  if (trimmed.toUpperCase() === "NULL") return null;
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) return Number(trimmed);
  return trimmed;
}

function extractInsertStatements(sql) {
  const statements = [];
  let offset = 0;

  while (offset < sql.length) {
    const start = sql.indexOf("INSERT INTO", offset);
    if (start === -1) break;

    let inString = false;
    let escaping = false;
    for (let index = start; index < sql.length; index += 1) {
      const char = sql[index];
      if (inString) {
        if (escaping) {
          escaping = false;
        } else if (char === "\\") {
          escaping = true;
        } else if (char === "'") {
          inString = false;
        }
        continue;
      }

      if (char === "'") {
        inString = true;
        continue;
      }
      if (char === ";") {
        statements.push(sql.slice(start, index + 1));
        offset = index + 1;
        break;
      }
      if (index === sql.length - 1) offset = sql.length;
    }
  }

  return statements;
}

function parseSqlDump(tableName) {
  const file = path.join(SOURCE_DIR, `${tableName}.sql`);
  if (!fs.existsSync(file)) return [];
  const sql = fs.readFileSync(file, "utf8");
  const rows = [];
  const inserts = extractInsertStatements(sql);

  for (const statement of inserts) {
    const insert = statement.match(/INSERT INTO `[^`]+` \(([^)]+)\) VALUES\s*([\s\S]*);$/);
    if (!insert) continue;
    const columns = [...insert[1].matchAll(/`([^`]+)`/g)].map((match) => match[1]);
    let row = null;
    let field = "";
    let inString = false;
    let escaping = false;

    const pushField = () => {
      row.push(parseScalar(field));
      field = "";
    };

    for (const char of insert[2]) {
      if (inString) {
        if (escaping) {
          const escapes = { n: "\n", r: "\r", t: "\t", 0: "\0" };
          field += escapes[char] ?? char;
          escaping = false;
        } else if (char === "\\") {
          escaping = true;
        } else if (char === "'") {
          inString = false;
        } else {
          field += char;
        }
        continue;
      }

      if (char === "'") {
        inString = true;
        continue;
      }
      if (char === "(" && row === null) {
        row = [];
        continue;
      }
      if (row && char === ",") {
        pushField();
        continue;
      }
      if (row && char === ")") {
        pushField();
        rows.push(Object.fromEntries(columns.map((column, index) => [column, row[index]])));
        row = null;
        continue;
      }
      if (row && !/\s/.test(char)) field += char;
    }
  }

  return rows;
}

function dumpRows() {
  return Object.fromEntries(SOURCE_TABLES.map((table) => [table, parseSqlDump(table)]));
}

function isoDateTime(date, time = "00:00:00") {
  const normalizedDate = legacyDatePart(date);
  const normalizedTime = cleanText(time);
  if (!normalizedDate || !normalizedTime || normalizedTime === "00:00:00") return null;
  return `${normalizedDate}T${normalizedTime}`;
}

function anchorTime(time) {
  const normalizedTime = cleanText(time);
  if (!normalizedTime || normalizedTime === "00:00:00") return null;
  return `1970-01-01T${normalizedTime}`;
}

function timeToMinutes(time) {
  const text = cleanText(time);
  if (!text) return 0;
  const match = text.match(/^(-)?(\d+):(\d+)(?::(\d+))?$/);
  if (!match) return 0;
  const sign = match[1] ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3]));
}

function mapStatus(active) {
  return Number(active ?? 0) === 1 ? "Ativo" : "Inativo";
}

function requestStatus(value) {
  const numeric = Number(value ?? 0);
  if (numeric === 1) return "In_Progress";
  if (numeric === 2) return "Resolved";
  if (numeric === 3) return "Closed";
  return "New";
}

function requestUrgency(value) {
  const text = requiredText(value, "").toLowerCase();
  if (text.includes("alta") || text.includes("urgent") || text.includes("high")) return "High";
  if (text.includes("media") || text.includes("média") || text.includes("medium")) return "Medium";
  return "Low";
}

function messageType(value) {
  const numeric = Number(value ?? 0);
  if (numeric === 2) return "Solution";
  if (numeric === 3) return "Rejection";
  if (numeric === 4) return "Acceptance";
  return "Message";
}

function questionType(value) {
  const numeric = Number(value ?? 0);
  if (numeric === 2) return "technical";
  if (numeric === 3) return "tech";
  if (numeric === 4) return "leadership";
  return "behavioral";
}

function evaluationRole(value) {
  const numeric = Number(value ?? 0);
  if (numeric === 1) return "SELF";
  if (numeric === 2) return "LEADER";
  if (numeric === 3) return "RH";
  if (numeric === 4) return "DIRECTOR";
  if (numeric === 5) return "SUBORDINATE";
  if (numeric === 6) return "TI";
  return "RH";
}

function addQuarantine(quarantine, table, row, reason, targetTable = null) {
  quarantine.push({
    legacy_table: table,
    legacy_id: String(row.id ?? ""),
    target_table: targetTable,
    reason,
    payload: row,
  });
}

function buildBaseMaps(rows) {
  const maps = {
    adminUserByLegacy: new Map(),
    collaboratorByLegacy: new Map(),
    departmentByLegacy: new Map(),
    clientByLegacy: new Map(),
    unionByLegacy: new Map(),
    rhCategoryByLegacy: new Map(),
    rhScoreByLegacy: new Map(),
    rhScoreByUserQuarter: new Map(),
    rhPointByLegacy: new Map(),
  };

  for (const row of rows["tb_admin.usuarios"]) {
    maps.adminUserByLegacy.set(String(row.id), generatedId("user:tb_admin.usuarios", row.id));
  }
  for (const row of rows["tb_rh.colaboradores"]) {
    const userId =
      maps.adminUserByLegacy.get(String(row.user_id)) ??
      generatedId("user:tb_rh.colaboradores", row.id);
    maps.collaboratorByLegacy.set(String(row.id), userId);
  }
  for (const row of rows["tb_admin.departamentos"]) {
    maps.departmentByLegacy.set(
      String(row.id),
      generatedId("department:tb_admin.departamentos", row.id),
    );
  }
  for (const row of rows["tb_integracao.clientes"]) {
    maps.clientByLegacy.set(String(row.id), generatedId("client:tb_integracao.clientes", row.id));
  }
  for (const row of rows["tb_pessoal.sindicato"]) {
    maps.unionByLegacy.set(String(row.id), generatedId("pessoal.union", row.id));
  }
  for (const row of rows["tb_rh.solicitacoes_categorias"]) {
    maps.rhCategoryByLegacy.set(String(row.id), generatedId("rh.request_categories", row.id));
  }
  for (const row of rows["tb_rh.score"]) {
    const userId = maps.collaboratorByLegacy.get(String(row.col_id));
    const id = generatedId("rh.score", row.id);
    maps.rhScoreByLegacy.set(String(row.id), id);
    if (userId) maps.rhScoreByUserQuarter.set(`${userId}|${row.trimestre}`, id);
  }
  for (const row of rows["tb_rh.pontos_registros"]) {
    maps.rhPointByLegacy.set(String(row.id), generatedId("rh.points", row.id));
  }

  return maps;
}

function buildLoad(rows, maps) {
  const load = {};
  const quarantine = [];

  load.departments = rows["tb_admin.departamentos"].map((row) => ({
    id: maps.departmentByLegacy.get(String(row.id)),
    name: requiredText(row.nome),
    color: requiredText(row.color, "#999999"),
    status: mapStatus(row.status),
    solution: boolLegacy(row.parceiros),
    organization_id: ORGANIZATION_ID,
  }));

  load.clients = rows["tb_integracao.clientes"].map((row) => {
    const type = normalizeKey(row.tipo).includes("fis") ? "PF" : "PJ";
    return {
      id: maps.clientByLegacy.get(String(row.id)),
      dominio_code: null,
      name: requiredText(row.nome),
      company_name: requiredText(row.nome),
      fantasy_name: cleanText(row.nome_fantasia),
      cnae: null,
      responsible: cleanText(row.socioAdm),
      cpf_responsible: cleanText(row.cpf_socio),
      agent: cleanText(row.preposto),
      cpf_agent: cleanText(row.cpf_preposto),
      number: cleanText(row.contato),
      email: cleanText(row.email),
      address: cleanText(row.endereco),
      cep: cleanText(row.cep),
      neighborhood: cleanText(row.bairro),
      state: cleanText(row.estado),
      city: cleanText(row.cidade),
      customer_since: nullableLegacyDate(row.inicio_contrato),
      municipal_registration: null,
      state_registration: null,
      commercial_board_registration: null,
      status: Number(row.tipo_cliente) === 1 ? "Ativo" : "Inativo",
      competence_entry: null,
      competence_output: null,
      opening_date: nullableLegacyDate(row.dataAbertura),
      instagram: cleanText(row.instagram),
      indication: cleanText(row.indicacao),
      regime: null,
      size: cleanText(row.complexidade),
      segment: null,
      start_strike: null,
      end_strike: null,
      deletion_date: null,
      contract: null,
      prospecting_status: "Migrado do legado",
      date_status: null,
      description_prospecting: null,
      participants_meet: null,
      meet_type: null,
      closing_date: null,
      register_date_prospecting: "1970-01-01T00:00:00",
      contabil: null,
      fiscal: null,
      pessoal: null,
      infoproduto: null,
      consultoria: null,
      castelo_med: null,
      cnae_secondary: null,
      service_unique: null,
      cpf_cnpj: digits(row.cpf_cnpj),
      type,
      type_registration: "Migrado",
      organization_id: ORGANIZATION_ID,
    };
  });

  load.users = rows["tb_admin.usuarios"].map((row) => ({
    id: maps.adminUserByLegacy.get(String(row.id)),
    name: requiredText(row.nome, requiredText(row.user, "Usuario legado")),
    login: requiredText(row.user, `legacy-${row.id}`),
    password: requiredText(row.password, "-"),
    permission: Number(row.cargo ?? 0),
    status: mapStatus(row.status),
    department_id: maps.departmentByLegacy.get(String(row.departamento_id)) ?? null,
    organization_id: ORGANIZATION_ID,
    photo_url: cleanText(row.img),
  }));

  const usersById = new Map(load.users.map((user) => [user.id, user]));
  for (const row of rows["tb_rh.colaboradores"]) {
    const id = maps.collaboratorByLegacy.get(String(row.id));
    const existing = usersById.get(id);
    const payload = {
      id,
      name: requiredText(row.nome, existing?.name ?? "Colaborador legado"),
      full_name: cleanText(row.nome),
      status: mapStatus(row.status),
      department_id:
        maps.departmentByLegacy.get(String(row.departamento_id)) ?? existing?.department_id ?? null,
      organization_id: ORGANIZATION_ID,
      gender: cleanText(row.genero),
      birth_date: nullableLegacyDate(row.data_nascimento),
      cpf: cleanText(row.cpf),
      rg: cleanText(row.rg),
      address: cleanText(row.endereco),
      job_title: cleanText(row.cargo),
      email: cleanText(row.email),
      phone: cleanText(row.telefone),
      hire_date: nullableLegacyDate(row.data_admissao),
      termination_date: nullableLegacyDate(row.data_demissao),
      photo_url: cleanText(row.foto) ?? existing?.photo_url ?? null,
    };
    usersById.set(id, { ...(existing ?? {}), ...payload });
  }
  load.users = [...usersById.values()];

  const allergiesByUser = new Map();
  for (const row of rows["tb_rh.alergias"]) {
    const userId = maps.collaboratorByLegacy.get(String(row.colaborador_id));
    if (!userId) {
      addQuarantine(
        quarantine,
        "tb_rh.alergias",
        row,
        "colaborador_id sem mapa legado",
        "users.allergies",
      );
      continue;
    }
    const items = allergiesByUser.get(userId) ?? [];
    items.push({
      legacy_id: row.id,
      name: cleanText(row.nome),
      sources: cleanText(row.fontes),
      treatment: cleanText(row.tratativo),
    });
    allergiesByUser.set(userId, items);
  }
  const contactsByUser = new Map();
  for (const row of rows["tb_rh.contatos_emergencia"]) {
    const userId = maps.collaboratorByLegacy.get(String(row.colaborador_id));
    if (!userId) {
      addQuarantine(
        quarantine,
        "tb_rh.contatos_emergencia",
        row,
        "colaborador_id sem mapa legado",
        "users.emergency_contacts",
      );
      continue;
    }
    const items = contactsByUser.get(userId) ?? [];
    items.push({
      legacy_id: row.id,
      name: cleanText(row.nome),
      relation: cleanText(row.referencia),
      phone: cleanText(row.numero),
    });
    contactsByUser.set(userId, items);
  }
  load.users = load.users.map((user) => ({
    ...user,
    allergies: allergiesByUser.get(user.id) ?? null,
    emergency_contacts: contactsByUser.get(user.id) ?? null,
  }));

  load.permissions = [];
  for (const row of rows["tb_admin.permissoes_rh"]) {
    const userId = maps.adminUserByLegacy.get(String(row.user_id));
    if (!userId) {
      addQuarantine(
        quarantine,
        "tb_admin.permissoes_rh",
        row,
        "user_id sem mapa legado",
        "permissions",
      );
      continue;
    }
    load.permissions.push({
      id: generatedId("permissions.rh", row.id),
      user_id: userId,
      rh: Number(row.permissao ?? 0),
      organization_id: ORGANIZATION_ID,
    });
  }
  for (const row of rows["tb_admin.permissoes_pessoal"]) {
    const userId = maps.adminUserByLegacy.get(String(row.user_id));
    if (!userId) {
      addQuarantine(
        quarantine,
        "tb_admin.permissoes_pessoal",
        row,
        "user_id sem mapa legado",
        "permissions",
      );
      continue;
    }
    load.permissions.push({
      id: generatedId("permissions.pessoal", row.id),
      user_id: userId,
      pessoal: Number(row.permissao ?? 0),
      organization_id: ORGANIZATION_ID,
    });
  }

  load["pessoal.union"] = rows["tb_pessoal.sindicato"].map((row) => ({
    id: maps.unionByLegacy.get(String(row.id)),
    name: requiredText(row.nome),
    cnpj: requiredText(row.cnpj, ""),
    base_date: nullableLegacyDate(row.data_base),
    organization_id: ORGANIZATION_ID,
  }));

  load["pessoal.payroll"] = [];
  for (const row of rows["tb_pessoal.folhas"]) {
    const clientId = maps.clientByLegacy.get(String(row.cliente_id));
    if (!clientId) {
      addQuarantine(
        quarantine,
        "tb_pessoal.folhas",
        row,
        "cliente_id sem mapa legado",
        "pessoal.payroll",
      );
      continue;
    }
    const responsibleId = maps.adminUserByLegacy.get(String(row.responsavel_id)) ?? null;
    const unionId = maps.unionByLegacy.get(String(row.sindicato)) ?? null;
    load["pessoal.payroll"].push({
      id: generatedId("pessoal.payroll", row.id),
      client_id: clientId,
      responsible_id: responsibleId,
      advance: boolLegacy(row.adiantamento),
      advance_type: cleanText(row.adiantamento_tipo),
      advance_amount: Number(row.adiantamento_valor ?? 0),
      info: requiredText(row.info, ""),
      previous: boolLegacy(row.previa),
      onvio: boolLegacy(row.onvio),
      group: requiredText(row.grupo, ""),
      vt: boolLegacy(row.vt),
      vt_value: Number(row.vt_valor ?? 0),
      vt_type: cleanText(row.vt_tipo),
      va: boolLegacy(row.va),
      assistance_fee: boolLegacy(row.taxa_assistencial),
      union_id: unionId,
      bem_mais: boolLegacy(row.bem_mais),
      bsf: boolLegacy(row.bsf),
      reinf: boolLegacy(row.reinf),
      employees: Number(row.funcionarios ?? 0),
      contact: cleanText(row.contato),
      organization_id: ORGANIZATION_ID,
    });
  }

  load["pessoal.ldd"] = [];
  for (const row of rows["tb_pessoal.ldd"]) {
    const clientId = maps.clientByLegacy.get(String(row.cliente));
    if (!clientId) {
      addQuarantine(quarantine, "tb_pessoal.ldd", row, "cliente sem mapa legado", "pessoal.ldd");
      continue;
    }
    load["pessoal.ldd"].push({
      id: generatedId("pessoal.ldd", row.id),
      client_id: clientId,
      type: requiredText(row.tipo),
      period: cleanText(row.periodo),
      due_date: nullableLegacyDate(row.vencimento),
      balance_amount: Number(row.saldo ?? 0),
      registration_status: cleanText(row.inscricao),
      status: cleanText(row.situacao),
      organization_id: ORGANIZATION_ID,
    });
  }

  load["pessoal.obrigations"] = [];
  for (const row of rows["tb_pessoal.obrigacoes"]) {
    const clientId = maps.clientByLegacy.get(String(row.cliente_id));
    if (!clientId) {
      addQuarantine(
        quarantine,
        "tb_pessoal.obrigacoes",
        row,
        "cliente_id sem mapa legado",
        "pessoal.obrigations",
      );
      continue;
    }
    load["pessoal.obrigations"].push({
      id: generatedId("pessoal.obrigations", row.id),
      client_id: clientId,
      competence: requiredText(row.comp),
      responsavel_id: maps.adminUserByLegacy.get(String(row.responsavel_id)) ?? null,
      advance: boolLegacy(row.adiantamento),
      payroll: boolLegacy(row.folha),
      charges: boolLegacy(row.encargos),
      assistance_fee: boolLegacy(row.taxa_assistencial),
      bem_mais: boolLegacy(row.bem_mais),
      bsf: boolLegacy(row.bsf),
      va: boolLegacy(row.va),
      vt: boolLegacy(row.vt),
      organization_id: ORGANIZATION_ID,
    });
  }

  load["pessoal.situations"] = [];
  for (const row of rows["tb_pessoal.clientes_situacoes"]) {
    const clientId = maps.clientByLegacy.get(String(row.cliente_id));
    const registeredById = maps.adminUserByLegacy.get(String(row.cadastrado_por));
    if (!clientId || !registeredById) {
      addQuarantine(
        quarantine,
        "tb_pessoal.clientes_situacoes",
        row,
        !clientId ? "cliente_id sem mapa legado" : "cadastrado_por sem mapa legado",
        "pessoal.situations",
      );
      continue;
    }
    load["pessoal.situations"].push({
      id: generatedId("pessoal.situations", row.id),
      client_id: clientId,
      status: boolLegacy(row.status) ? "Concluido" : "Aberto",
      title: requiredText(row.titulo),
      description: requiredText(row.descricao, ""),
      registration_date: nullableLegacyDate(row.data_cadastro) ?? "1970-01-01",
      completion_date: nullableLegacyDate(row.data_finalizacao),
      registered_by_id: registeredById,
      completed_by_id: maps.adminUserByLegacy.get(String(row.finalizado_por)) ?? null,
      organization_id: ORGANIZATION_ID,
    });
  }

  load["pessoal.passwords"] = [];
  const addPassword = (
    table,
    row,
    serviceName,
    clientLegacyId,
    responsibleLegacyId,
    fields,
    notes = null,
  ) => {
    const clientId = maps.clientByLegacy.get(String(clientLegacyId));
    if (!clientId) {
      addQuarantine(quarantine, table, row, "cliente/empresa sem mapa legado", "pessoal.passwords");
      return;
    }
    load["pessoal.passwords"].push({
      id: generatedId(`pessoal.passwords:${table}`, row.id),
      client_id: clientId,
      service_name: serviceName,
      login_main: encodePessoalPasswordSecret(fields.login_main),
      senha_main: encodePessoalPasswordSecret(fields.senha_main),
      login_secondary: encodePessoalPasswordSecret(fields.login_secondary),
      senha_secondary: encodePessoalPasswordSecret(fields.senha_secondary),
      responsavel_id: maps.adminUserByLegacy.get(String(responsibleLegacyId)) ?? null,
      notes,
      organization_id: ORGANIZATION_ID,
      dry_run_secret_fields_present: Object.fromEntries(
        Object.entries(fields).map(([key, value]) => [key, cleanText(value) !== null]),
      ),
    });
  };
  for (const row of rows["tb_pessoal.bem"]) {
    addPassword("tb_pessoal.bem", row, "BEM", row.empresa, row.responsavel, {
      login_main: row.usuario,
      senha_main: row.senha,
      login_secondary: row.identificador,
    });
  }
  for (const row of rows["tb_pessoal.bsf"]) {
    addPassword("tb_pessoal.bsf", row, "BSF", row.empresa, row.responsavel, {
      login_main: row.login,
      senha_main: row.senha,
      login_secondary: row.cpf,
    });
  }
  for (const row of rows["tb_pessoal.codigos_acesso"]) {
    addPassword(
      "tb_pessoal.codigos_acesso",
      row,
      "Codigos de acesso",
      row.empresa,
      null,
      {
        login_main: row.cpf,
        senha_main: row.senha,
        login_secondary: row.cod_acesso,
        senha_secondary: row.senha_gov,
      },
      `certificado_digital=${row.certificado_digital ?? ""}`,
    );
  }
  for (const row of rows["tb_pessoal.contri_assis"]) {
    addPassword("tb_pessoal.contri_assis", row, "Contribuicao assistencial", row.cliente_id, null, {
      login_main: row.login,
      senha_main: row.senha,
    });
  }
  for (const row of rows["tb_pessoal.empregador_web"]) {
    addPassword("tb_pessoal.empregador_web", row, "Empregador Web", row.empresa, null, {
      login_main: row.login,
      senha_main: row.senha,
      login_secondary: row.email,
      senha_secondary: row.senha_email,
    });
  }

  load["rh.pointConfig"] = [];
  for (const row of rows["tb_rh.pontos"]) {
    const userId = maps.collaboratorByLegacy.get(String(row.colaborador));
    if (!userId) {
      addQuarantine(
        quarantine,
        "tb_rh.pontos",
        row,
        "colaborador sem mapa legado",
        "rh.pointConfig",
      );
      continue;
    }
    const startTime = anchorTime(row.entrada);
    const lunchBreak = anchorTime(row.saida_almoco);
    const lunchReturn = anchorTime(row.retorno_almoco);
    const endTime = anchorTime(row.saida);
    if (!startTime || !lunchBreak || !lunchReturn || !endTime) {
      addQuarantine(
        quarantine,
        "tb_rh.pontos",
        row,
        "horario obrigatorio ausente",
        "rh.pointConfig",
      );
      continue;
    }
    load["rh.pointConfig"].push({
      id: generatedId("rh.pointConfig", row.id),
      user_id: userId,
      start_time: startTime,
      lunch_break: lunchBreak,
      lunch_return: lunchReturn,
      end_time: endTime,
      signature: cleanText(row.assinatura),
      bank_balance: timeToMinutes(row.banco_horas),
      work_days: "1,2,3,4,5",
      organization_id: ORGANIZATION_ID,
    });
  }

  load["rh.points"] = [];
  for (const row of rows["tb_rh.pontos_registros"]) {
    const userId = maps.collaboratorByLegacy.get(String(row.colaborador));
    const clockIn = isoDateTime(row.data, row.entrada);
    if (!userId || !clockIn) {
      addQuarantine(
        quarantine,
        "tb_rh.pontos_registros",
        row,
        !userId ? "colaborador sem mapa legado" : "entrada obrigatoria ausente",
        "rh.points",
      );
      continue;
    }
    load["rh.points"].push({
      id: maps.rhPointByLegacy.get(String(row.id)),
      user_id: userId,
      clock_in: clockIn,
      lunch_out: isoDateTime(row.data, row.saida_almoco),
      lunch_in: isoDateTime(row.data, row.retorno_almoco),
      clock_out: isoDateTime(row.data, row.saida),
      workload_hours: timeToMinutes(row.hora_diaria),
      signature: boolLegacy(row.assinado) ? "legacy-signed" : null,
      time_bank_balance: timeToMinutes(row.horas_extras) - timeToMinutes(row.horas_faltantes),
      organization_id: ORGANIZATION_ID,
    });
  }

  load["rh.timeSheets"] = [];
  for (const row of rows["tb_rh.pontos_folhas"]) {
    const userId = maps.collaboratorByLegacy.get(String(row.colaborador));
    if (!userId) {
      addQuarantine(
        quarantine,
        "tb_rh.pontos_folhas",
        row,
        "colaborador sem mapa legado",
        "rh.timeSheets",
      );
      continue;
    }
    load["rh.timeSheets"].push({
      id: generatedId("rh.timeSheets", row.id),
      user_id: userId,
      start_time: nullableLegacyDate(row.inicio) ?? "1970-01-01",
      end_time: nullableLegacyDate(row.fim) ?? nullableLegacyDate(row.inicio) ?? "1970-01-01",
      signature: cleanText(row.assinatura),
      status: cleanText(row.assinatura) ? "Assinada" : "Gerada",
      days: null,
      totals: null,
      organization_id: ORGANIZATION_ID,
    });
  }

  load["rh.timeBankReleases"] = [];
  for (const row of rows["tb_rh.pontos_adicionais_folhas"]) {
    const userId = maps.collaboratorByLegacy.get(String(row.colaborador));
    const addedByUserId = maps.adminUserByLegacy.get(String(row.adicionado_por));
    if (!userId || !addedByUserId) {
      addQuarantine(
        quarantine,
        "tb_rh.pontos_adicionais_folhas",
        row,
        !userId ? "colaborador sem mapa legado" : "adicionado_por sem mapa legado",
        "rh.timeBankReleases",
      );
      continue;
    }
    load["rh.timeBankReleases"].push({
      id: generatedId("rh.timeBankReleases", row.id),
      user_id: userId,
      date: nullableLegacyDate(row.data) ?? "1970-01-01",
      minutes: timeToMinutes(row.horas),
      reason: requiredText(row.motivo),
      is_approved: boolLegacy(row.aprovado),
      added_by_user_id: addedByUserId,
      organization_id: ORGANIZATION_ID,
    });
  }

  load["rh.timeClockRequest"] = [];
  for (const row of rows["tb_rh.pontos_solicitacoes"]) {
    const userId = maps.collaboratorByLegacy.get(String(row.colaborador));
    const pointId = maps.rhPointByLegacy.get(String(row.ponto));
    if (!userId || !pointId) {
      addQuarantine(
        quarantine,
        "tb_rh.pontos_solicitacoes",
        row,
        !userId ? "colaborador sem mapa legado" : "ponto sem mapa legado",
        "rh.timeClockRequest",
      );
      continue;
    }
    load["rh.timeClockRequest"].push({
      id: generatedId("rh.timeClockRequest", row.id),
      user_id: userId,
      point_id: pointId,
      clock_in: isoDateTime(row.data, row.entrada) ?? nullableLegacyDate(row.data) ?? "1970-01-01",
      lunch_out: isoDateTime(row.data, row.saida_almoco),
      lunch_in: isoDateTime(row.data, row.retorno_almoco),
      clock_out: isoDateTime(row.data, row.saida),
      justification: requiredText(row.justificativa),
      attachment: cleanText(row.anexo),
      date: nullableLegacyDate(row.data) ?? "1970-01-01",
      status: requestStatus(row.status),
      approver_user_id: maps.adminUserByLegacy.get(String(row.aprovador)) ?? null,
      obs_approver: cleanText(row.obs_aprovador),
      organization_id: ORGANIZATION_ID,
    });
  }

  load["rh.holidays"] = rows["tb_rh.feriados"].map((row) => ({
    id: generatedId("rh.holidays", row.id),
    name: requiredText(row.nome),
    date: nullableLegacyDate(row.data) ?? "1970-01-01",
    organization_id: ORGANIZATION_ID,
  }));

  load["rh.score_questions"] = rows["tb_rh.score_perguntas"].map((row) => ({
    id: generatedId("rh.score_questions", row.id),
    question: requiredText(row.quesito),
    type: questionType(row.avaliacao),
    active: boolLegacy(row.status),
    question_id: String(row.id),
    organization_id: ORGANIZATION_ID,
  }));

  load["rh.score"] = [];
  for (const row of rows["tb_rh.score"]) {
    const userId = maps.collaboratorByLegacy.get(String(row.col_id));
    if (!userId) {
      addQuarantine(quarantine, "tb_rh.score", row, "col_id sem mapa legado", "rh.score");
      continue;
    }
    load["rh.score"].push({
      id: maps.rhScoreByLegacy.get(String(row.id)),
      user_id: userId,
      quarter: requiredText(row.trimestre),
      behavioral: Number(row.score_comportamental ?? 0),
      technical: Number(row.score_tecnico ?? 0),
      technology: Number(row.score_ti ?? 0),
      leadership: Number(row.score_lider ?? 0),
      final_score: Number(row.score_final ?? row.score ?? 0),
      organization_id: ORGANIZATION_ID,
    });
  }

  load["rh.score_nitro"] = [];
  for (const row of rows["tb_rh.score_nitro"]) {
    const userId = maps.collaboratorByLegacy.get(String(row.col_id));
    const scoreId = userId ? maps.rhScoreByUserQuarter.get(`${userId}|${row.trimestre}`) : null;
    if (!scoreId) {
      addQuarantine(
        quarantine,
        "tb_rh.score_nitro",
        row,
        "score base sem mapa legado",
        "rh.score_nitro",
      );
      continue;
    }
    load["rh.score_nitro"].push({
      id: generatedId("rh.score_nitro", row.id),
      score_id: scoreId,
      projects_score: Number(row.projetos ?? 0),
      hours_score: Number(row.ch ?? 0),
      errors_score: Number(row.erros ?? 0),
      folders_score: Number(row.pastas ?? 0),
      total_hours: Number(row.ch ?? 0),
      total_errors: Number(row.erros ?? 0),
      organization_id: ORGANIZATION_ID,
    });
  }

  load["rh.score_evaluations"] = [];
  for (const row of rows["tb_rh.score_avaliacoes"]) {
    const userId = maps.collaboratorByLegacy.get(String(row.col_id));
    const scoreId = userId ? maps.rhScoreByUserQuarter.get(`${userId}|${row.trimestre}`) : null;
    if (!scoreId) {
      addQuarantine(
        quarantine,
        "tb_rh.score_avaliacoes",
        row,
        "score base sem mapa legado",
        "rh.score_evaluations",
      );
      continue;
    }
    const answers = Array.from({ length: 8 }, (_, index) => {
      const number = index + 1;
      return {
        question_id: String(number),
        answer: Number(row[`p${number}`] ?? row[`n${number}`] ?? 0),
        obs: cleanText(row[`obs${number}`]) ?? undefined,
      };
    });
    load["rh.score_evaluations"].push({
      id: generatedId("rh.score_evaluations", row.id),
      score_id: scoreId,
      evaluator_id: maps.adminUserByLegacy.get(String(row.avaliador)) ?? null,
      type: questionType(row.tipo),
      status: boolLegacy(row.status) ? "Completed" : "Pending",
      answers,
      average_score:
        answers.reduce((sum, answer) => sum + Number(answer.answer ?? 0), 0) / answers.length,
      evaluator_role: evaluationRole(row.tipo),
      organization_id: ORGANIZATION_ID,
    });
  }

  load["rh.request_categories"] = rows["tb_rh.solicitacoes_categorias"].map((row) => ({
    id: maps.rhCategoryByLegacy.get(String(row.id)),
    name: requiredText(row.categoria),
    active: boolLegacy(row.status),
    organization_id: ORGANIZATION_ID,
  }));

  load["rh.requests"] = [];
  for (const row of rows["tb_rh.solicitacoes"]) {
    const requesterId = maps.collaboratorByLegacy.get(String(row.requerente));
    const assignedToId = maps.adminUserByLegacy.get(String(row.atribuido));
    const categoryId = maps.rhCategoryByLegacy.get(String(row.categoria));
    if (!requesterId || !categoryId) {
      addQuarantine(
        quarantine,
        "tb_rh.solicitacoes",
        row,
        !requesterId ? "requerente sem mapa de colaborador legado" : "categoria sem mapa legado",
        "rh.requests",
      );
      continue;
    }
    load["rh.requests"].push({
      id: generatedId("rh.requests", row.id),
      title: requiredText(row.titulo),
      description: requiredText(row.descricao, ""),
      requester_user_id: requesterId,
      category_id: categoryId,
      assigned_to_user_id: assignedToId ?? null,
      urgency: requestUrgency(row.urgencia),
      status: requestStatus(row.status),
      created_at: nullableLegacyDate(row.data_cadastro) ?? "1970-01-01",
      updated_at:
        nullableLegacyDate(row.data_atualizacao) ??
        nullableLegacyDate(row.data_cadastro) ??
        "1970-01-01",
      organization_id: ORGANIZATION_ID,
    });
  }

  const requestIds = new Set(load["rh.requests"].map((row) => row.id));
  load["rh.request_messages"] = [];
  for (const row of rows["tb_rh.solicitacoes_mensagens"]) {
    const requestId = generatedId("rh.requests", row.solicitacao);
    const senderUserId = maps.adminUserByLegacy.get(String(row.remetente));
    if (!requestIds.has(requestId) || !senderUserId) {
      addQuarantine(
        quarantine,
        "tb_rh.solicitacoes_mensagens",
        row,
        !requestIds.has(requestId) ? "solicitacao sem mapa legado" : "remetente sem mapa legado",
        "rh.request_messages",
      );
      continue;
    }
    load["rh.request_messages"].push({
      id: generatedId("rh.request_messages", row.id),
      request_id: requestId,
      sender_user_id: senderUserId,
      message: requiredText(row.mensagem, ""),
      attachment: null,
      type: messageType(row.tipo),
      is_read: boolLegacy(row.lida),
      created_at: nullableLegacyDate(row.data_envio) ?? "1970-01-01",
      organization_id: ORGANIZATION_ID,
    });
  }

  for (const table of QUARANTINE_ONLY) {
    for (const row of rows[table]) {
      addQuarantine(
        quarantine,
        table,
        row,
        "sem tabela destino equivalente confirmada no sistema novo",
      );
    }
  }

  return { load, quarantine };
}

function mapToObject(map) {
  return Object.fromEntries(
    [...map.entries()].sort(([left], [right]) => left.localeCompare(right)),
  );
}

async function loadPg() {
  const require = createRequire(import.meta.url);
  try {
    return require("pg");
  } catch {
    const pnpmDir = path.join(ROOT, "node_modules", ".pnpm");
    const pgPackage = fs
      .readdirSync(pnpmDir)
      .find(
        (entry) =>
          entry.startsWith("pg@") && fs.existsSync(path.join(pnpmDir, entry, "node_modules", "pg")),
      );
    if (!pgPackage) throw new Error("Pacote pg nao encontrado em node_modules.");
    return require(path.join(pnpmDir, pgPackage, "node_modules", "pg"));
  }
}

function normalizeDocument(value) {
  const text = digits(value);
  return text.length > 0 ? text : null;
}

function normalizeNatural(value) {
  const text = cleanText(value);
  return text ? text.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase() : null;
}

function addBucket(index, key, row) {
  if (!key) return;
  const bucket = index.get(key) ?? [];
  bucket.push(row);
  index.set(key, bucket);
}

function bucketCount(index, key) {
  return key && index.has(key) ? index.get(key).length : 0;
}

function firstBucketRow(index, key) {
  const bucket = key ? index.get(key) : null;
  return bucket?.[0] ?? null;
}

function sampleNaturalConflicts(rows, indexes, descriptors, limit = 20) {
  const samples = [];
  for (const row of rows) {
    for (const descriptor of descriptors) {
      const key = descriptor.key(row);
      const match = firstBucketRow(indexes[descriptor.index], key);
      if (!match || match.id === row.id) continue;
      samples.push({
        table: descriptor.table,
        field: descriptor.field,
        value: descriptor.redact ? descriptor.redact(key) : key,
        generated_id: row.id,
        current_id: match.id,
      });
      break;
    }
    if (samples.length >= limit) break;
  }
  return samples;
}

function redactDocument(value) {
  if (!value) return null;
  return `${String(value).slice(0, 4)}***${String(value).slice(-2)}`;
}

async function withPg(callback) {
  if (!process.env.DATABASE_URL) return { skipped: true, reason: "DATABASE_URL nao definida." };
  const pg = await loadPg();
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    return await callback(client);
  } finally {
    await client.end();
  }
}

function uniqueIndex(rows, keyFn) {
  const values = new Map();
  const duplicateKeys = new Set();
  for (const row of rows) {
    const key = keyFn(row);
    if (!key) continue;
    if (values.has(key)) {
      duplicateKeys.add(key);
      continue;
    }
    values.set(key, row);
  }
  for (const key of duplicateKeys) values.delete(key);
  return { values, duplicateKeys };
}

function currentClientKey(row) {
  return [
    normalizeNatural(row.name),
    normalizeNatural(row.fantasy_name),
    normalizeDocument(row.cpf_cnpj),
    normalizeNatural(row.email),
  ].join("|");
}

function loadClientKey(row) {
  return [
    normalizeNatural(row.name),
    normalizeNatural(row.fantasy_name),
    normalizeDocument(row.cpf_cnpj),
    normalizeNatural(row.email),
  ].join("|");
}

function registerReplacement(replacements, usedCurrentIds, report, scope, loadId, currentId, rule) {
  if (!loadId || !currentId || loadId === currentId) return;
  if (usedCurrentIds.has(currentId)) {
    report.collisions.push({ scope, loadId, currentId, rule });
    return;
  }
  replacements.set(loadId, currentId);
  usedCurrentIds.add(currentId);
  report.scopes[scope].matched += 1;
  report.scopes[scope].byRule[rule] = (report.scopes[scope].byRule[rule] ?? 0) + 1;
}

function applyControlledUserIdOverrides(maps, currentUsers, report, replacements) {
  if (!report.scopes.users || CONTROLLED_CURRENT_USER_ID_OVERRIDES.size === 0) return;

  const usedCurrentIds = new Set(replacements.values());
  report.controlledOverrides = report.controlledOverrides ?? [];

  for (const [legacyId, override] of CONTROLLED_CURRENT_USER_ID_OVERRIDES.entries()) {
    const loadId = maps.adminUserByLegacy.get(legacyId);
    const currentUser = currentUsers.find((row) => row.id === override.currentId);
    const baseReport = {
      scope: "users",
      legacyId,
      loadId: loadId ?? null,
      currentId: override.currentId,
      legacyLogin: override.legacyLogin,
      currentLogin: currentUser?.login ?? override.currentLogin,
      reason: override.reason,
    };

    if (!loadId || !currentUser || loadId === override.currentId) {
      report.controlledOverrides.push({
        ...baseReport,
        applied: false,
        skippedReason: !loadId
          ? "legacy-user-not-in-load"
          : !currentUser
            ? "current-user-not-found"
            : "same-id",
      });
      continue;
    }

    if (usedCurrentIds.has(override.currentId)) {
      report.collisions.push({
        scope: "users",
        loadId,
        currentId: override.currentId,
        rule: "controlled-legacy-user-override",
      });
      report.controlledOverrides.push({
        ...baseReport,
        applied: false,
        skippedReason: "current-user-already-used",
      });
      continue;
    }

    replacements.set(loadId, override.currentId);
    usedCurrentIds.add(override.currentId);
    report.scopes.users.matched += 1;
    report.scopes.users.byRule["controlled-legacy-user-override"] =
      (report.scopes.users.byRule["controlled-legacy-user-override"] ?? 0) + 1;
    report.controlledOverrides.push({ ...baseReport, applied: true });
  }
}

function applyControlledClientIdOverrides(maps, currentClients, report, replacements) {
  if (!report.scopes.clients || CONTROLLED_CURRENT_CLIENT_ID_OVERRIDES.size === 0) return;

  const usedCurrentIds = new Set(replacements.values());
  report.controlledOverrides = report.controlledOverrides ?? [];

  for (const [legacyId, override] of CONTROLLED_CURRENT_CLIENT_ID_OVERRIDES.entries()) {
    const loadId = maps.clientByLegacy.get(legacyId);
    const currentClient = currentClients.find((row) => row.id === override.currentId);
    const baseReport = {
      scope: "clients",
      legacyId,
      loadId: loadId ?? null,
      currentId: override.currentId,
      legacyName: override.legacyName,
      currentName: currentClient?.name ?? null,
      currentStatus: currentClient?.status ?? null,
      document: override.document,
      reason: override.reason,
    };

    if (!loadId || !currentClient || loadId === override.currentId) {
      report.controlledOverrides.push({
        ...baseReport,
        applied: false,
        skippedReason: !loadId
          ? "legacy-client-not-in-load"
          : !currentClient
            ? "current-client-not-found"
            : "same-id",
      });
      continue;
    }

    if (usedCurrentIds.has(override.currentId)) {
      report.collisions.push({
        scope: "clients",
        loadId,
        currentId: override.currentId,
        rule: "controlled-legacy-client-override",
      });
      report.controlledOverrides.push({
        ...baseReport,
        applied: false,
        skippedReason: "current-client-already-used",
      });
      continue;
    }

    replacements.set(loadId, override.currentId);
    usedCurrentIds.add(override.currentId);
    report.scopes.clients.matched += 1;
    report.scopes.clients.byRule["controlled-legacy-client-override"] =
      (report.scopes.clients.byRule["controlled-legacy-client-override"] ?? 0) + 1;
    report.controlledOverrides.push({ ...baseReport, applied: true });
  }
}

function reconcileScope(loadRows, currentRows, descriptors, report, scope) {
  const replacements = new Map();
  const usedCurrentIds = new Set();
  const indexes = descriptors.map((descriptor) => ({
    ...descriptor,
    index: uniqueIndex(currentRows, descriptor.currentKey),
  }));
  report.scopes[scope] = {
    load: loadRows.length,
    current: currentRows.length,
    matched: 0,
    unmatched: 0,
    byRule: {},
    duplicateKeys: Object.fromEntries(
      indexes.map((descriptor) => [descriptor.name, descriptor.index.duplicateKeys.size]),
    ),
  };

  for (const row of loadRows) {
    for (const descriptor of indexes) {
      const key = descriptor.loadKey(row);
      if (!key) continue;
      const currentRow = descriptor.index.values.get(key);
      if (!currentRow) continue;
      registerReplacement(
        replacements,
        usedCurrentIds,
        report,
        scope,
        row.id,
        currentRow.id,
        descriptor.name,
      );
      break;
    }
  }

  return { replacements, usedCurrentIds };
}

function replaceIdsInValue(value, replacements) {
  if (typeof value === "string") return replacements.get(value) ?? value;
  if (Array.isArray(value)) return value.map((item) => replaceIdsInValue(item, replacements));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, replaceIdsInValue(item, replacements)]),
    );
  }
  return value;
}

function replaceLoadIds(load, maps, replacements) {
  if (replacements.size === 0) return;
  for (const [table, rows] of Object.entries(load)) {
    load[table] = rows.map((row) => replaceIdsInValue(row, replacements));
  }
  for (const map of Object.values(maps)) {
    for (const [key, value] of map.entries()) {
      map.set(key, replacements.get(value) ?? value);
    }
  }
}

async function reconcileCurrentTenantIds(load, maps) {
  if (!RECONCILE_CURRENT_IDS) return null;
  return withPg(async (client) => {
    const currentUsers = (
      await client.query(
        "select id, name, login, cpf, rg, email from users where organization_id = $1",
        [ORGANIZATION_ID],
      )
    ).rows;
    const currentClients = (
      await client.query(
        "select id, name, fantasy_name, cpf_cnpj, email, status, dominio_code, ctid::text as _ctid from clients where organization_id = $1 order by ctid",
        [ORGANIZATION_ID],
      )
    ).rows;
    const currentDepartments = (
      await client.query("select id, name from departments where organization_id = $1", [
        ORGANIZATION_ID,
      ])
    ).rows;

    const report = {
      enabled: true,
      strategy:
        "Preservar IDs atuais do tenant quando houver correspondencia controlada; manter IDs v3 para novos registros.",
      scopes: {},
      collisions: [],
    };
    const allReplacements = new Map();

    for (const [scope, result] of Object.entries({
      departments: reconcileScope(
        load.departments ?? [],
        currentDepartments,
        [
          {
            name: "name",
            loadKey: (row) => normalizeNatural(row.name),
            currentKey: (row) => normalizeNatural(row.name),
          },
        ],
        report,
        "departments",
      ),
      users: reconcileScope(
        load.users ?? [],
        currentUsers,
        [
          {
            name: "login",
            loadKey: (row) => normalizeNatural(row.login),
            currentKey: (row) => normalizeNatural(row.login),
          },
          {
            name: "cpf",
            loadKey: (row) => normalizeDocument(row.cpf),
            currentKey: (row) => normalizeDocument(row.cpf),
          },
          {
            name: "rg",
            loadKey: (row) => normalizeDocument(row.rg),
            currentKey: (row) => normalizeDocument(row.rg),
          },
          {
            name: "email",
            loadKey: (row) => normalizeNatural(row.email),
            currentKey: (row) => normalizeNatural(row.email),
          },
        ],
        report,
        "users",
      ),
      clients: reconcileScope(
        load.clients ?? [],
        currentClients,
        [
          { name: "full-key", loadKey: loadClientKey, currentKey: currentClientKey },
          {
            name: "name-document",
            loadKey: (row) => {
              const document = normalizeDocument(row.cpf_cnpj);
              return document ? `${normalizeNatural(row.name)}|${document}` : null;
            },
            currentKey: (row) => {
              const document = normalizeDocument(row.cpf_cnpj);
              return document ? `${normalizeNatural(row.name)}|${document}` : null;
            },
          },
          {
            name: "name-fantasy",
            loadKey: (row) => `${normalizeNatural(row.name)}|${normalizeNatural(row.fantasy_name)}`,
            currentKey: (row) =>
              `${normalizeNatural(row.name)}|${normalizeNatural(row.fantasy_name)}`,
          },
          {
            name: "name",
            loadKey: (row) => normalizeNatural(row.name),
            currentKey: (row) => normalizeNatural(row.name),
          },
        ],
        report,
        "clients",
      ),
    })) {
      for (const [loadId, currentId] of result.replacements.entries()) {
        allReplacements.set(loadId, currentId);
      }
      report.scopes[scope].unmatched = report.scopes[scope].load - report.scopes[scope].matched;
    }

    applyControlledUserIdOverrides(maps, currentUsers, report, allReplacements);
    report.scopes.users.unmatched = report.scopes.users.load - report.scopes.users.matched;
    applyControlledClientIdOverrides(maps, currentClients, report, allReplacements);
    report.scopes.clients.unmatched = report.scopes.clients.load - report.scopes.clients.matched;

    const clientResult = { usedCurrentIds: new Set([...allReplacements.values()]) };
    for (let index = 0; index < (load.clients ?? []).length; index += 1) {
      const row = load.clients[index];
      if (allReplacements.has(row.id)) continue;
      const currentRow = currentClients[index];
      if (!currentRow || normalizeNatural(row.name) !== normalizeNatural(currentRow.name)) continue;
      registerReplacement(
        allReplacements,
        clientResult.usedCurrentIds,
        report,
        "clients",
        row.id,
        currentRow.id,
        "ctid-order-name",
      );
    }
    report.scopes.clients.unmatched = report.scopes.clients.load - report.scopes.clients.matched;

    replaceLoadIds(load, maps, allReplacements);
    report.totalReplacements = allReplacements.size;
    return report;
  });
}

async function collectCurrentConflicts(load) {
  return withPg(async (client) => {
    const result = {};
    for (const table of Object.keys(load)) {
      const ids = load[table].map((row) => row.id).filter(Boolean);
      if (ids.length === 0) {
        result[table] = { generated: 0, alreadyExistsById: 0 };
        continue;
      }
      const response = await client.query(
        `select count(*)::int as total from "${table}" where id = any($1::text[])`,
        [ids],
      );
      result[table] = { generated: ids.length, alreadyExistsById: response.rows[0].total };
    }
    return result;
  });
}

async function collectPreflight(load) {
  return withPg(async (client) => {
    const currentUsers = (
      await client.query("select id, login, cpf, rg, email from users where organization_id = $1", [
        ORGANIZATION_ID,
      ])
    ).rows;
    const currentClients = (
      await client.query(
        "select id, name, fantasy_name, cpf_cnpj, email from clients where organization_id = $1",
        [ORGANIZATION_ID],
      )
    ).rows;
    const currentDepartments = (
      await client.query("select id, name from departments where organization_id = $1", [
        ORGANIZATION_ID,
      ])
    ).rows;
    const requestAssigneeColumn = (
      await client.query(`
        select is_nullable
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'rh.requests'
          and column_name = 'assigned_to_user_id'
      `)
    ).rows[0];
    const requestAssigneeNullable = requestAssigneeColumn?.is_nullable === "YES";

    const currentUserIds = new Set(currentUsers.map((row) => row.id));
    const currentClientIds = new Set(currentClients.map((row) => row.id));
    const currentDepartmentIds = new Set(currentDepartments.map((row) => row.id));
    const loadClientIds = new Set((load.clients ?? []).map((row) => row.id));
    const loadDepartmentIds = new Set((load.departments ?? []).map((row) => row.id));

    const indexes = {
      usersByLogin: new Map(),
      usersByCpf: new Map(),
      usersByRg: new Map(),
      usersByEmail: new Map(),
      clientsByDocument: new Map(),
      clientsByName: new Map(),
      clientsByEmail: new Map(),
      departmentsByName: new Map(),
    };

    for (const row of currentUsers) {
      addBucket(indexes.usersByLogin, normalizeNatural(row.login), row);
      addBucket(indexes.usersByCpf, normalizeDocument(row.cpf), row);
      addBucket(indexes.usersByRg, normalizeDocument(row.rg), row);
      addBucket(indexes.usersByEmail, normalizeNatural(row.email), row);
    }
    for (const row of currentClients) {
      addBucket(indexes.clientsByDocument, normalizeDocument(row.cpf_cnpj), row);
      addBucket(indexes.clientsByName, normalizeNatural(row.name), row);
      addBucket(indexes.clientsByEmail, normalizeNatural(row.email), row);
    }
    for (const row of currentDepartments) {
      addBucket(indexes.departmentsByName, normalizeNatural(row.name), row);
    }

    const users = load.users ?? [];
    const clients = load.clients ?? [];
    const departments = load.departments ?? [];

    const naturalConflicts = {
      users: {
        byLogin: users.filter(
          (row) =>
            bucketCount(indexes.usersByLogin, normalizeNatural(row.login)) > 0 &&
            !currentUserIds.has(row.id),
        ).length,
        byCpf: users.filter(
          (row) =>
            bucketCount(indexes.usersByCpf, normalizeDocument(row.cpf)) > 0 &&
            !currentUserIds.has(row.id),
        ).length,
        byRg: users.filter(
          (row) =>
            bucketCount(indexes.usersByRg, normalizeDocument(row.rg)) > 0 &&
            !currentUserIds.has(row.id),
        ).length,
        byEmail: users.filter(
          (row) =>
            bucketCount(indexes.usersByEmail, normalizeNatural(row.email)) > 0 &&
            !currentUserIds.has(row.id),
        ).length,
      },
      clients: {
        byDocument: clients.filter(
          (row) =>
            bucketCount(indexes.clientsByDocument, normalizeDocument(row.cpf_cnpj)) > 0 &&
            !currentClientIds.has(row.id),
        ).length,
        byName: clients.filter(
          (row) =>
            bucketCount(indexes.clientsByName, normalizeNatural(row.name)) > 0 &&
            !currentClientIds.has(row.id),
        ).length,
        byEmail: clients.filter(
          (row) =>
            bucketCount(indexes.clientsByEmail, normalizeNatural(row.email)) > 0 &&
            !currentClientIds.has(row.id),
        ).length,
      },
      departments: {
        byName: departments.filter(
          (row) =>
            bucketCount(indexes.departmentsByName, normalizeNatural(row.name)) > 0 &&
            !currentDepartmentIds.has(row.id),
        ).length,
      },
    };

    const idempotency = Object.fromEntries(
      Object.entries(load).map(([table, rows]) => {
        const currentIds =
          table === "users"
            ? currentUserIds
            : table === "clients"
              ? currentClientIds
              : table === "departments"
                ? currentDepartmentIds
                : null;
        const alreadyExistsById = currentIds
          ? rows.filter((row) => currentIds.has(row.id)).length
          : rows.filter(() => false).length;
        return [
          table,
          {
            generated: rows.length,
            insertCandidateById: rows.length - alreadyExistsById,
            alreadyExistsById,
          },
        ];
      }),
    );

    const missingDepartmentRefs = users.filter(
      (row) =>
        row.department_id &&
        !currentDepartmentIds.has(row.department_id) &&
        !loadDepartmentIds.has(row.department_id),
    ).length;

    const tableRefCount = (table, field, currentIds, loadIds) =>
      (load[table] ?? []).filter(
        (row) => row[field] && !currentIds.has(row[field]) && !loadIds.has(row[field]),
      ).length;

    const missingClientRefs = {
      "pessoal.payroll": tableRefCount(
        "pessoal.payroll",
        "client_id",
        currentClientIds,
        loadClientIds,
      ),
      "pessoal.ldd": tableRefCount("pessoal.ldd", "client_id", currentClientIds, loadClientIds),
      "pessoal.obrigations": tableRefCount(
        "pessoal.obrigations",
        "client_id",
        currentClientIds,
        loadClientIds,
      ),
      "pessoal.situations": tableRefCount(
        "pessoal.situations",
        "client_id",
        currentClientIds,
        loadClientIds,
      ),
      "pessoal.passwords": tableRefCount(
        "pessoal.passwords",
        "client_id",
        currentClientIds,
        loadClientIds,
      ),
    };

    const conflictSamples = [
      ...sampleNaturalConflicts(users, indexes, [
        {
          table: "users",
          field: "login",
          index: "usersByLogin",
          key: (row) => normalizeNatural(row.login),
        },
        {
          table: "users",
          field: "cpf",
          index: "usersByCpf",
          key: (row) => normalizeDocument(row.cpf),
          redact: redactDocument,
        },
        {
          table: "users",
          field: "rg",
          index: "usersByRg",
          key: (row) => normalizeDocument(row.rg),
          redact: redactDocument,
        },
        {
          table: "users",
          field: "email",
          index: "usersByEmail",
          key: (row) => normalizeNatural(row.email),
        },
      ]),
      ...sampleNaturalConflicts(clients, indexes, [
        {
          table: "clients",
          field: "cpf_cnpj",
          index: "clientsByDocument",
          key: (row) => normalizeDocument(row.cpf_cnpj),
          redact: redactDocument,
        },
        {
          table: "clients",
          field: "name",
          index: "clientsByName",
          key: (row) => normalizeNatural(row.name),
        },
        {
          table: "clients",
          field: "email",
          index: "clientsByEmail",
          key: (row) => normalizeNatural(row.email),
        },
      ]),
      ...sampleNaturalConflicts(departments, indexes, [
        {
          table: "departments",
          field: "name",
          index: "departmentsByName",
          key: (row) => normalizeNatural(row.name),
        },
      ]),
    ].slice(0, 50);

    const blockers = [];
    const naturalConflictTotal = [
      ...Object.values(naturalConflicts.users),
      ...Object.values(naturalConflicts.clients),
      ...Object.values(naturalConflicts.departments),
    ].reduce((sum, count) => sum + count, 0);
    if (naturalConflictTotal > 0) {
      blockers.push({
        code: "previous-load-natural-conflicts",
        severity: "critical",
        message:
          "O tenant atual contem registros equivalentes por campos naturais, mas com IDs diferentes da regra v3. Gravar agora pode duplicar a primeira migracao.",
        counts: naturalConflicts,
      });
    }
    if (missingDepartmentRefs > 0) {
      blockers.push({
        code: "missing-department-fk",
        severity: "high",
        message:
          "Usuarios do dry-run apontam para department_id v3 que nao existe no banco atual nem no pacote de carga.",
        count: missingDepartmentRefs,
      });
    }
    const missingClientTotal = Object.values(missingClientRefs).reduce(
      (sum, count) => sum + count,
      0,
    );
    if (missingClientTotal > 0) {
      blockers.push({
        code: "missing-client-fk",
        severity: "high",
        message:
          "Registros de Departamento Pessoal apontam para client_id v3 que nao existe no banco atual nem no pacote de carga.",
        counts: missingClientRefs,
      });
    }
    const unassignedRequests = (load["rh.requests"] ?? []).filter(
      (row) => row.assigned_to_user_id === null,
    ).length;
    if (unassignedRequests > 0 && !requestAssigneeNullable) {
      blockers.push({
        code: "rh-request-assignee-not-null-in-db",
        severity: "high",
        message:
          "O legado possui chamados RH sem atribuido; aplique a migration que permite assigned_to_user_id nulo antes da carga.",
        unassigned: unassignedRequests,
        prepared: (load["rh.requests"] ?? []).length,
      });
    }

    const cleanTenantBlockers = blockers.filter(
      (blocker) => !["previous-load-natural-conflicts"].includes(blocker.code),
    );

    return {
      canApplyDirectly: blockers.length === 0,
      canApplyToCleanTenantWithoutSchemaChanges: cleanTenantBlockers.length === 0,
      safeForFirstWrite: blockers.length === 0,
      recommendation:
        blockers.length === 0
          ? "Pode seguir para etapa de apply controlado/idempotente."
          : "Nao gravar ainda; resolver bloqueios antes de qualquer INSERT/UPDATE.",
      idempotency,
      currentTenant: {
        users: currentUsers.length,
        clients: currentClients.length,
        departments: currentDepartments.length,
      },
      schema: {
        rh_requests_assigned_to_user_id_nullable: requestAssigneeNullable,
      },
      naturalConflicts,
      conflictSamples,
      missingReferences: {
        users_department_id: missingDepartmentRefs,
        client_id: missingClientRefs,
      },
      blockers,
      cleanTenantBlockers,
    };
  });
}

async function collectApplyReadiness(load) {
  return collectPreflight(load);
}

function writeJson(relativePath, data) {
  const file = path.join(OUT_DIR, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

function summarize(rows, load, quarantine, currentConflicts, reconciliation) {
  const sourceRows = Object.fromEntries(
    Object.entries(rows).map(([table, tableRows]) => [table, tableRows.length]),
  );
  const loadRows = Object.fromEntries(
    Object.entries(load).map(([table, tableRows]) => [table, tableRows.length]),
  );
  const quarantineByTable = {};
  const quarantineByReason = {};
  for (const item of quarantine) {
    quarantineByTable[item.legacy_table] = (quarantineByTable[item.legacy_table] ?? 0) + 1;
    quarantineByReason[item.reason] = (quarantineByReason[item.reason] ?? 0) + 1;
  }

  return {
    generatedAt: new Date().toISOString(),
    mode: "dry-run",
    sourceDir: SOURCE_DIR,
    outDir: OUT_DIR,
    organization_id: ORGANIZATION_ID,
    rules: {
      sourceOfTruth: "backup legado",
      identity: "schema.tabela + id legado",
      forbiddenIdentityHeuristics: ["nome", "cpf", "email"],
      noDatabaseWrites: true,
      missingTarget: "quarantine",
      missingForeignKeyMap: "quarantine",
      secrets: ENCRYPT_PESSOAL_PASSWORDS
        ? "encrypted with pessoal-service AES-256-GCM payload; plaintext is never written"
        : "redacted in dry-run; migration apply must encrypt with pessoal-service crypto",
      pessoalPasswordEncryption: {
        enabled: ENCRYPT_PESSOAL_PASSWORDS,
        keyVersion: ENCRYPT_PESSOAL_PASSWORDS ? PESSOAL_PASSWORD_ENCRYPTION_KEY_VERSION : null,
      },
    },
    sourceRows,
    loadRows,
    quarantine: {
      total: quarantine.length,
      byTable: quarantineByTable,
      byReason: quarantineByReason,
    },
    currentConflicts,
    reconciliation,
  };
}

async function main() {
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const rows = dumpRows();
  const maps = buildBaseMaps(rows);
  const { load, quarantine } = buildLoad(rows, maps);
  const reconciliation = await reconcileCurrentTenantIds(load, maps);
  const currentConflicts = await collectCurrentConflicts(load);
  const applyReadiness = await collectApplyReadiness(load);
  const preflight = applyReadiness;
  const manifest = {
    ...summarize(rows, load, quarantine, currentConflicts, reconciliation),
    applyReadiness,
    preflight,
  };

  for (const [table, tableRows] of Object.entries(load)) {
    writeJson(`load/${table}.json`, tableRows);
  }
  writeJson("quarantine/quarantine.json", quarantine);
  if (reconciliation) writeJson("reports/reconciliation-current-ids.json", reconciliation);
  writeJson("reports/apply-readiness.json", applyReadiness);
  writeJson("reports/preflight-anti-duplication.json", preflight);
  writeJson("maps/admin-users.json", mapToObject(maps.adminUserByLegacy));
  writeJson("maps/rh-collaborators.json", mapToObject(maps.collaboratorByLegacy));
  writeJson("maps/departments.json", mapToObject(maps.departmentByLegacy));
  writeJson("maps/clients-integracao.json", mapToObject(maps.clientByLegacy));
  writeJson("maps/pessoal-unions.json", mapToObject(maps.unionByLegacy));
  writeJson("maps/rh-request-categories.json", mapToObject(maps.rhCategoryByLegacy));
  writeJson("maps/rh-score.json", mapToObject(maps.rhScoreByLegacy));
  writeJson("maps/rh-points.json", mapToObject(maps.rhPointByLegacy));
  writeJson("reports/load-order.json", [
    "departments",
    "clients",
    "users",
    "permissions",
    "pessoal.union",
    "pessoal.payroll",
    "pessoal.ldd",
    "pessoal.obrigations",
    "pessoal.situations",
    "pessoal.passwords",
    "rh.request_categories",
    "rh.score_questions",
    "rh.pointConfig",
    "rh.points",
    "rh.timeSheets",
    "rh.timeBankReleases",
    "rh.timeClockRequest",
    "rh.score",
    "rh.score_nitro",
    "rh.score_evaluations",
    "rh.requests",
    "rh.request_messages",
  ]);
  writeJson("manifest.json", manifest);

  console.log(JSON.stringify(manifest, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
