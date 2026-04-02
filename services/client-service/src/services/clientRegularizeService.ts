import { ServiceError } from "@workspace/shared";
import type { PrismaClient } from "../generated/prisma/client.js";
import type { UpdateRegularizeBody } from "../schemas/clientVerticals.schema.js";
import { cleanDocument } from "../utils/documents.js";

export async function updateRegularizeClient(
  prisma: PrismaClient,
  clientId: string,
  organizationId: string,
  _userId: string | null,
  input: UpdateRegularizeBody,
): Promise<Record<string, unknown>> {
  const exists = await prisma.client.findFirst({
    where: { id: clientId, organization_id: organizationId },
    select: { id: true },
  });
  if (!exists) {
    throw new ServiceError(404, "Cliente não encontrado.");
  }

  const cleanedCpfCnpj = input.cpf_cnpj !== undefined ? cleanDocument(input.cpf_cnpj) : undefined;
  const cleanedCpfResponsible =
    input.cpf_responsible !== undefined ? cleanDocument(input.cpf_responsible) : undefined;

  const data = {
    ...(input.dominio_code !== undefined ? { dominio_code: input.dominio_code } : {}),
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.company_name !== undefined ? { company_name: input.company_name } : {}),
    ...(input.fantasy_name !== undefined ? { fantasy_name: input.fantasy_name } : {}),
    ...(cleanedCpfCnpj !== undefined ? { cpf_cnpj: cleanedCpfCnpj } : {}),
    ...(input.cnae !== undefined ? { cnae: input.cnae } : {}),
    ...(input.cnae_secondary !== undefined ? { cnae_secondary: input.cnae_secondary } : {}),
    ...(input.responsible !== undefined ? { responsible: input.responsible } : {}),
    ...(cleanedCpfResponsible !== undefined ? { cpf_responsible: cleanedCpfResponsible } : {}),
    ...(input.number !== undefined ? { number: input.number } : {}),
    ...(input.email !== undefined ? { email: input.email } : {}),
    ...(input.address !== undefined ? { address: input.address } : {}),
    ...(input.cep !== undefined ? { cep: input.cep } : {}),
    ...(input.neighborhood !== undefined ? { neighborhood: input.neighborhood } : {}),
    ...(input.state !== undefined ? { state: input.state } : {}),
    ...(input.city !== undefined ? { city: input.city } : {}),
    ...(input.customer_since !== undefined ? { customer_since: input.customer_since } : {}),
    ...(input.municipal_registration !== undefined
      ? { municipal_registration: input.municipal_registration }
      : {}),
    ...(input.state_registration !== undefined
      ? { state_registration: input.state_registration }
      : {}),
    ...(input.commercial_board_registration !== undefined
      ? { commercial_board_registration: input.commercial_board_registration }
      : {}),
    ...(input.opening_date !== undefined ? { opening_date: input.opening_date } : {}),
    ...(input.regime !== undefined ? { regime: input.regime } : {}),
    ...(input.size !== undefined ? { size: input.size } : {}),
    ...(input.segment !== undefined ? { segment: input.segment } : {}),
    ...(input.contabil !== undefined ? { contabil: input.contabil } : {}),
    ...(input.fiscal !== undefined ? { fiscal: input.fiscal } : {}),
    ...(input.pessoal !== undefined ? { pessoal: input.pessoal } : {}),
    ...(input.infoproduto !== undefined ? { infoproduto: input.infoproduto } : {}),
    ...(input.consultoria !== undefined ? { consultoria: input.consultoria } : {}),
    ...(input.start_strike !== undefined ? { start_strike: input.start_strike } : {}),
    ...(input.end_strike !== undefined ? { end_strike: input.end_strike } : {}),
    ...(input.deletion_date !== undefined ? { deletion_date: input.deletion_date } : {}),
  };

  const select = {
    id: true,
    dominio_code: true,
    name: true,
    company_name: true,
    fantasy_name: true,
    cpf_cnpj: true,
    cnae_secondary: true,
    cnae: true,
    responsible: true,
    cpf_responsible: true,
    address: true,
    cep: true,
    neighborhood: true,
    state: true,
    city: true,
    customer_since: true,
    municipal_registration: true,
    state_registration: true,
    commercial_board_registration: true,
    status: true,
    competence_entry: true,
    competence_output: true,
    opening_date: true,
    regime: true,
    size: true,
    segment: true,
    contabil: true,
    fiscal: true,
    pessoal: true,
    infoproduto: true,
    consultoria: true,
    start_strike: true,
    end_strike: true,
    deletion_date: true,
  };

  const updated = await prisma.client.update({
    where: { id: clientId },
    data,
    select,
  });

  return updated as Record<string, unknown>;
}
