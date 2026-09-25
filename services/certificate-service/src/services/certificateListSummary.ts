export interface CertificateListSummary {
  expired: number;
  expiring_30_days: number;
  with_certificate: number;
}

type CountWhere = Record<string, unknown>;

const EXPIRING_WINDOW_DAYS = 30;
const BUSINESS_TIME_ZONE = "America/Sao_Paulo";

// Datas de vencimento são gravadas como meia-noite UTC do dia; "hoje" segue o fuso do escritório.
function startOfBusinessDay(now: Date): Date {
  const isoDate = new Intl.DateTimeFormat("en-CA", { timeZone: BUSINESS_TIME_ZONE }).format(now);
  return new Date(`${isoDate}T00:00:00.000Z`);
}

/** Conta os KPIs do topo sobre toda a base filtrada, não só sobre a página. */
export async function countCertificateListSummary(
  count: (args: { where: CountWhere }) => Promise<number>,
  where: CountWhere,
  now: Date = new Date(),
): Promise<CertificateListSummary> {
  const today = startOfBusinessDay(now);
  const windowEnd = new Date(today);
  windowEnd.setUTCDate(windowEnd.getUTCDate() + EXPIRING_WINDOW_DAYS + 1);

  const [expired, expiring, withCertificate] = await Promise.all([
    count({ where: { AND: [where, { expiration_date: { lt: today } }] } }),
    count({ where: { AND: [where, { expiration_date: { gte: today, lt: windowEnd } }] } }),
    count({ where: { AND: [where, { has_certificate: true }] } }),
  ]);

  return { expired, expiring_30_days: expiring, with_certificate: withCertificate };
}
