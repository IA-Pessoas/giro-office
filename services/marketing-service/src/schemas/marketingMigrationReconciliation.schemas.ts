import { z } from "zod";

export const migrationReconciliationDatasetSchema = z.enum([
  "eventos",
  "eventos_edicoes",
  "eventos_feedbacks_periodos",
  "eventos_feedbacks",
  "redes_sociais",
  "senhas",
  "ai_usage",
]);

export const migrationReconciliationOrganizationSchema = z.object({
  organizationId: z.string().uuid(),
});

export const resolveMigrationAssociationSchema = z.object({
  organizationId: z.string().uuid(),
  sourceTable: z.literal("tb_mkt.eventos_edicoes"),
  sourceIdentityDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  stepId: z.string().regex(/^[A-Za-z0-9_.-]{1,120}$/),
  canonicalTargetId: z.string().uuid(),
});

export type MigrationReconciliationDataset = z.infer<typeof migrationReconciliationDatasetSchema>;
export type ResolveMigrationAssociation = z.infer<typeof resolveMigrationAssociationSchema>;
