import type {
  TiExtensionsReportingSource,
  TiInventoryReportingSource,
  TiRequestsReportingSource,
} from "@workspace/shared";

import { TiExtensionsReportingService } from "./tiExtensionsReportingService.js";
import { TiInventoryReportingService } from "./tiInventoryReportingService.js";
import { TiRequestsReportingService } from "./tiRequestsReportingService.js";

type InternalReportingSource =
  | TiExtensionsReportingSource
  | TiInventoryReportingSource
  | TiRequestsReportingSource;

export class TiInternalReportingService {
  private readonly inventory: TiInventoryReportingService;
  private readonly requests: TiRequestsReportingService;
  private readonly extensions: TiExtensionsReportingService;

  readonly catalog: {
    sources: readonly unknown[];
    relations: readonly unknown[];
  };

  constructor(
    prisma: ConstructorParameters<typeof TiInventoryReportingService>[0] &
      ConstructorParameters<typeof TiRequestsReportingService>[0] &
      ConstructorParameters<typeof TiExtensionsReportingService>[0],
  ) {
    this.inventory = new TiInventoryReportingService(prisma);
    this.requests = new TiRequestsReportingService(prisma);
    this.extensions = new TiExtensionsReportingService(prisma);
    this.catalog = {
      sources: [
        ...this.inventory.catalog.sources,
        ...this.requests.catalog.sources,
        ...this.extensions.catalog.sources,
      ],
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
    if (input.source === "ti.extensions") {
      return this.extensions.extract({ ...input, source: "ti.extensions" });
    }
    return this.requests.extract({ ...input, source: "ti.requests" });
  }
}
