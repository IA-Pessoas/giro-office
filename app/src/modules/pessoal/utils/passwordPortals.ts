/**
 * Serviços prontos do cofre do Pessoal e os atalhos dos portais que a ficha antiga abria
 * (`pessoal/pages/clientes/cliente.php`). O atalho é só o endereço público de login do portal:
 * endereço fixo, sem usuário, senha ou token, e sem login automático.
 */
export const PESSOAL_PASSWORD_SERVICE_OPTIONS = [
  "Portal eSocial",
  "Gov.br",
  "Empregador Web",
  "Cefaz",
  "Feira Legal",
  "Prefeitura",
  "Bem Mais",
  "BSF",
  "Onvio",
] as const;

export type PessoalPasswordServiceOption = (typeof PESSOAL_PASSWORD_SERVICE_OPTIONS)[number];

const ESOCIAL_LOGIN_URL = "https://login.esocial.gov.br/login.aspx";

/** Portal de cada serviço pronto; os códigos de acesso Gov entram pelo login do eSocial. */
export const PESSOAL_PASSWORD_PORTALS: Partial<Record<PessoalPasswordServiceOption, string>> = {
  "Portal eSocial": ESOCIAL_LOGIN_URL,
  "Gov.br": ESOCIAL_LOGIN_URL,
  "Empregador Web": "https://sd.mte.gov.br/sdweb/empregadorweb/index.jsf",
  "Bem Mais": "https://sistemas.bemmaisbeneficios.com.br/empresa/loginEmpresa.jsf",
  BSF: "https://boleto.bsfonline.com.br/",
};

export function isPessoalPasswordKnownService(value: string): value is PessoalPasswordServiceOption {
  return PESSOAL_PASSWORD_SERVICE_OPTIONS.includes(value as PessoalPasswordServiceOption);
}

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

/** Nomes da tela antiga e variações comuns de digitação; a comparação é normalizada. */
const PORTAL_ALIASES = new Map<string, PessoalPasswordServiceOption>(
  (
    [
      ["eSocial", "Portal eSocial"],
      ["Códigos de Acesso Gov", "Gov.br"],
      ["Código de Acesso Gov", "Gov.br"],
      ["Bem+", "Bem Mais"],
      ["Bem+(Mais)", "Bem Mais"],
      ["Benefício Social Familiar", "BSF"],
    ] as const
  ).map(([alias, service]) => [normalize(alias), service]),
);

/**
 * Atalho do portal pelo nome do serviço, sem diferenciar caixa, acento ou espaço nas pontas.
 * Nome personalizado que não corresponde a um portal conhecido não tem atalho.
 */
export function pessoalPasswordPortalUrl(serviceName: string): string | null {
  const wanted = normalize(serviceName);
  const service =
    PESSOAL_PASSWORD_SERVICE_OPTIONS.find((option) => normalize(option) === wanted) ??
    PORTAL_ALIASES.get(wanted);
  return service ? (PESSOAL_PASSWORD_PORTALS[service] ?? null) : null;
}
