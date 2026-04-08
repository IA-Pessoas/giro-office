import type { PrismaClient } from "../generated/prisma/client.js";

export class RegularizeReconciliationService {
  constructor(private readonly prisma: PrismaClient) {}

  async runFullReconciliation(): Promise<Record<string, unknown>> {
    return {
      processed: 0,
      pendingImplementation: true,
    };
  }

  async handleClientPfChanged(_organizationId: string, _clientPfId: string): Promise<void> {}

  async handlePartnersChanged(_organizationId: string, _clientPfId: string): Promise<void> {}

  async handleLicenseChanged(_organizationId: string, _licenseId: string): Promise<void> {}
}
