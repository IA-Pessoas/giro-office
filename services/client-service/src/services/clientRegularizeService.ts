import { ServiceError } from "@workspace/shared";
import type { PrismaClient } from "../generated/prisma/client.js";
import type { UpdateRegularizeBody } from "../schemas/clientVerticals.schemas.js";
import { assertValidClientDocument } from "../utils/clientDocuments.js";
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
    select: { id: true, type: true },
  });
  if (!exists) {
    throw new ServiceError(404, "Cliente não encontrado.");
  }

  const cleanedCpfCnpj =
    input.cpf_cnpj !== undefined
      ? assertValidClientDocument(input.cpf_cnpj, exists.type)
      : undefined;
  const cleanedCpfResponsible =
    input.cpf_responsible !== undefined ? cleanDocument(input.cpf_responsible) : undefined;

  const data: Record<string, unknown> = {};

  if (input.dominio_code !== undefined) {
    data.dominio_code = input.dominio_code;
  }

  if (input.name !== undefined) {
    data.name = input.name;
  }

  if (input.company_name !== undefined) {
    data.company_name = input.company_name;
  }

  if (input.fantasy_name !== undefined) {
    data.fantasy_name = input.fantasy_name;
  }

  if (cleanedCpfCnpj !== undefined) {
    const duplicate = await prisma.client.findFirst({
      where: {
        organization_id: organizationId,
        cpf_cnpj: cleanedCpfCnpj,
        id: { not: clientId },
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new ServiceError(409, "Cliente já cadastrado.");
    }
    data.cpf_cnpj = cleanedCpfCnpj;
  }

  if (input.cnae !== undefined) {
    data.cnae = input.cnae;
  }

  if (input.cnae_secondary !== undefined) {
    data.cnae_secondary = input.cnae_secondary;
  }

  if (input.responsible !== undefined) {
    data.responsible = input.responsible;
  }

  if (cleanedCpfResponsible !== undefined) {
    data.cpf_responsible = cleanedCpfResponsible;
  }

  if (input.number !== undefined) {
    data.number = input.number;
  }

  if (input.email !== undefined) {
    data.email = input.email;
  }

  if (input.address !== undefined) {
    data.address = input.address;
  }

  if (input.cep !== undefined) {
    data.cep = input.cep;
  }

  if (input.neighborhood !== undefined) {
    data.neighborhood = input.neighborhood;
  }

  if (input.state !== undefined) {
    data.state = input.state;
  }

  if (input.city !== undefined) {
    data.city = input.city;
  }

  if (input.customer_since !== undefined) {
    data.customer_since = input.customer_since;
  }

  if (input.municipal_registration !== undefined) {
    data.municipal_registration = input.municipal_registration;
  }

  if (input.state_registration !== undefined) {
    data.state_registration = input.state_registration;
  }

  if (input.commercial_board_registration !== undefined) {
    data.commercial_board_registration = input.commercial_board_registration;
  }

  if (input.opening_date !== undefined) {
    data.opening_date = input.opening_date;
  }

  if (input.regime !== undefined) {
    data.regime = input.regime;
  }

  if (input.size !== undefined) {
    data.size = input.size;
  }

  if (input.segment !== undefined) {
    data.segment = input.segment;
  }

  if (input.contabil !== undefined) {
    data.contabil = input.contabil;
  }

  if (input.fiscal !== undefined) {
    data.fiscal = input.fiscal;
  }

  if (input.pessoal !== undefined) {
    data.pessoal = input.pessoal;
  }

  if (input.infoproduto !== undefined) {
    data.infoproduto = input.infoproduto;
  }

  if (input.consultoria !== undefined) {
    data.consultoria = input.consultoria;
  }

  if (input.start_strike !== undefined) {
    data.start_strike = input.start_strike;
  }

  if (input.end_strike !== undefined) {
    data.end_strike = input.end_strike;
  }

  if (input.deletion_date !== undefined) {
    data.deletion_date = input.deletion_date;
  }

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
