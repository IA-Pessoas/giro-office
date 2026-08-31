import type { TiInventoryReportingSource, TiRequestsReportingSource } from "@workspace/shared";

import { TiInventoryReportingService } from "./tiInventoryReportingService.js";
import { TiRequestsReportingService } from "./tiRequestsReportingService.js";

type InternalReportingSource = TiInventoryReportingSource | TiRequestsReportingSource;

export class TiInternalReportingService {
  private readonly inventory: TiInventoryReportingService;
  private readonly requests: TiRequestsReportingService;

  readonly catalog: {
    sources: readonly unknown[];
    relations: readonly unknown[];
  };

  constructor(
    prisma: ConstructorParameters<typeof TiInventoryReportingService>[0] &
      ConstructorParameters<typeof TiRequestsReportingService>[0],
  ) {
    this.inventory = new TiInventoryReportingService(prisma);
    this.requests = new TiRequestsReportingService(prisma);
    this.catalog = {
      sources: [...this.inventory.catalog.sources, ...this.requests.catalog.sources],
      relations: [],
    };
  }

  async extract(input: {
    organizationId: string;
    source: InternalReportingSource;
    fields: readonly string[];
    limit: number;
  }): Promise<{ rows: readonly Record<string, unknown>[]; reachedLimit: boolean }> {
    if (input.source === "ti.inventory") {
      return this.inventory.extract({ ...input, source: "ti.inventory" });
    }
    return this.requests.extract({ ...input, source: "ti.requests" });
  }
}
