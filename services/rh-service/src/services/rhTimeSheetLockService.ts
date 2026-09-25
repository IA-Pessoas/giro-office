import { ServiceError } from "@workspace/shared";

import type { Prisma } from "../generated/prisma/client.js";
import { DEFAULT_ORGANIZATION_TIMEZONE, organizationDayBounds } from "../utils/rhDateUtils.js";

type TimeSheetLockDb = Pick<Prisma.TransactionClient, "timeSheets">;

export async function assertPointDayIsUnlocked(
  db: TimeSheetLockDb,
  input: {
    organizationId: string;
    userId: string;
    day: Date;
    timezone?: string;
  },
): Promise<void> {
  const { start, end } = organizationDayBounds(
    input.day,
    input.timezone ?? DEFAULT_ORGANIZATION_TIMEZONE,
  );
  const signedSheet = await db.timeSheets.findFirst({
    where: {
      organization_id: input.organizationId,
      user_id: input.userId,
      start_time: { lte: end },
      end_time: { gte: start },
      OR: [{ status: "Assinada" }, { signature: { not: null } }],
    },
    select: { id: true },
  });

  if (signedSheet) {
    throw new ServiceError(
      409,
      "O dia está bloqueado por uma folha assinada; reabra a folha antes de altera-lo.",
    );
  }
}
