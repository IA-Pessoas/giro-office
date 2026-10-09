import type { FiscalHistoryReader } from "./fiscalHistorySimulation.js";

/** O mínimo do cliente `pg` que o leitor usa. */
export interface HistoryQueryable {
  query<T>(text: string, values?: unknown[]): Promise<{ rows: T[] }>;
}

/**
 * Leitor da simulação sobre Postgres. Só SELECT; quem chama abre a conexão numa transação
 * READ ONLY, então o banco recusa qualquer escrita mesmo que alguém altere este arquivo.
 */
export function createPgHistoryReader(db: HistoryQueryable): FiscalHistoryReader {
  return {
    async clientsByIds(organizationId, ids) {
      if (!ids.length) return [];
      const { rows } = await db.query<{ id: string; organization_id: string }>(
        "select id, organization_id from clients where organization_id = $1 and id = any($2)",
        [organizationId, ids],
      );
      return rows;
    },
    async clientsByDominioCodes(organizationId, codes) {
      if (!codes.length) return [];
      const { rows } = await db.query<{ id: string; dominio_code: string | null }>(
        "select id, dominio_code from clients where organization_id = $1 and dominio_code = any($2)",
        [organizationId, codes],
      );
      return rows;
    },
    async existingMonthlyControls(organizationId, clientIds) {
      if (!clientIds.length) return [];
      const { rows } = await db.query<{ client_id: string; competence: string }>(
        `select client_id, to_char(competence, 'YYYY-MM') as competence
           from "fiscal.monthly_controls"
          where organization_id = $1 and client_id = any($2)`,
        [organizationId, clientIds],
      );
      return rows;
    },
    async existingAnnualControls(organizationId, clientIds) {
      if (!clientIds.length) return [];
      const { rows } = await db.query<{ client_id: string; year: number }>(
        `select client_id, year from "fiscal.annual_controls"
          where organization_id = $1 and client_id = any($2)`,
        [organizationId, clientIds],
      );
      return rows;
    },
  };
}
