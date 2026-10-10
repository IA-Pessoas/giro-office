import { normalizeCpfCnpj } from "@workspace/shared";

import { parseVeriWorkbook, type VeriInvalidEntry } from "./veriWorkbookParser.js";

// Carteira comparada pelo relatorios/veri.php: clientes ativos ou em processo de inativação
// (situação A ou P no legado).
const COMPARED_CLIENT_STATUSES = ["Ativo", "Processo de Inativação", "A", "P"];

export type VeriComparisonStatus = "Ambos" | "Veri" | "Workspace";

export interface VeriComparisonRow {
  name: string;
  document: string;
  in_veri: boolean;
  in_workspace: boolean;
  status: VeriComparisonStatus;
}

export interface VeriComparison {
  rows: VeriComparisonRow[];
  invalid: VeriInvalidEntry[];
  totals: {
    veri: number;
    workspace: number;
    both: number;
    veri_only: number;
    workspace_only: number;
    invalid: number;
    // Clientes da carteira sem CPF/CNPJ no cadastro: não há como compará-los.
    workspace_without_document: number;
  };
}

type VeriClientDelegate = {
  findMany(input: {
    where: { organization_id: string; status: { in: string[] } };
    select: { name: true; cpf_cnpj: true };
    orderBy: { name: "asc" };
  }): Promise<readonly { name: string; cpf_cnpj: string | null }[]>;
};

export class VeriComparisonService {
  constructor(private readonly prisma: { client: VeriClientDelegate }) {}

  // Nada é gravado: o arquivo é lido em memória e o resultado volta na resposta, então duas
  // comparações nunca sobrescrevem a saída uma da outra (o PHP gravava um veri.csv único).
  async compare(input: { organizationId: string; file: Buffer }): Promise<VeriComparison> {
    const workbook = parseVeriWorkbook(input.file);
    const clients = await this.prisma.client.findMany({
      where: { organization_id: input.organizationId, status: { in: COMPARED_CLIENT_STATUSES } },
      select: { name: true, cpf_cnpj: true },
      orderBy: { name: "asc" },
    });

    const veri = new Map(workbook.entries.map((entry) => [entry.document, entry.name]));
    const workspace = new Map<string, string>();
    let workspaceWithoutDocument = 0;
    for (const client of clients) {
      const document = normalizeCpfCnpj(client.cpf_cnpj);
      if (document) workspace.set(document, client.name);
      else workspaceWithoutDocument++;
    }

    const rows = [...new Set([...veri.keys(), ...workspace.keys()])]
      .map((document): VeriComparisonRow => {
        const inVeri = veri.has(document);
        const inWorkspace = workspace.has(document);
        return {
          // Como no PHP: o nome do cadastro prevalece; o da planilha só vale para quem não está nele.
          name: workspace.get(document) ?? veri.get(document) ?? "",
          document,
          in_veri: inVeri,
          in_workspace: inWorkspace,
          status: inVeri && inWorkspace ? "Ambos" : inVeri ? "Veri" : "Workspace",
        };
      })
      .sort((left, right) => left.name.localeCompare(right.name, "pt-BR", { sensitivity: "base" }));

    const count = (status: VeriComparisonStatus) =>
      rows.filter((row) => row.status === status).length;
    return {
      rows,
      invalid: workbook.invalid,
      totals: {
        veri: veri.size,
        workspace: workspace.size,
        both: count("Ambos"),
        veri_only: count("Veri"),
        workspace_only: count("Workspace"),
        invalid: workbook.invalid.length,
        workspace_without_document: workspaceWithoutDocument,
      },
    };
  }
}
