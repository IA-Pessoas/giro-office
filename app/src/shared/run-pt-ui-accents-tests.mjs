import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

const checks = [
  {
    file: "shared/utils/meProfileUpdate.ts",
    required: ["Não foi possível atualizar o perfil."],
    forbidden: ["Nao foi possivel atualizar o perfil."],
  },
  {
    file: "shared/hooks/useMeMutations.ts",
    required: [
      "Não foi possível atualizar a foto.",
      "Não foi possível remover a foto.",
    ],
    forbidden: [
      "Nao foi possivel atualizar a foto.",
      "Nao foi possivel remover a foto.",
    ],
  },
  {
    file: "shared/components/newLayout/AppShell.tsx",
    required: [
      'MODULE_ACCESS_LOADING_MESSAGE = "Carregando acesso ao módulo."',
      'MODULE_NAV_LOADING_MESSAGE = "Carregando módulos"',
    ],
    forbidden: [
      'MODULE_ACCESS_LOADING_MESSAGE = "Carregando acesso ao modulo."',
      'MODULE_NAV_LOADING_MESSAGE = "Carregando modulos"',
    ],
  },
  {
    file: "context/AuthContext.tsx",
    required: [
      "Validando sua sessão e carregando os acessos necessários para abrir o ambiente com segurança.",
    ],
    forbidden: [
      "Validando sua sessao e carregando os acessos necessarios para abrir o ambiente com seguranca.",
    ],
  },
  {
    file: "context/ChatContext.tsx",
    required: [
      "Tipo de arquivo não suportado.",
      "Não foi possível enviar sua mídia.",
    ],
    forbidden: [
      "Tipo de arquivo nao suportado.",
      "Nao foi possivel enviar sua midia.",
    ],
  },
];

for (const check of checks) {
  const source = read(check.file);
  for (const text of check.required) {
    assert.ok(source.includes(text), `${check.file} missing: ${text}`);
  }
  for (const text of check.forbidden) {
    assert.ok(!source.includes(text), `${check.file} still has: ${text}`);
  }
}

console.log("pt ui accents tests passed");
