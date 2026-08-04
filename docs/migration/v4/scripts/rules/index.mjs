import { ADMIN_BUSINESS_EVIDENCE } from "../evidence/admin-business.mjs";
import {
  INTEGRACAO_REGULARIZE_AUDITED_CORPORA,
  INTEGRACAO_REGULARIZE_EVIDENCE,
  INTEGRACAO_REGULARIZE_SOURCE_TABLES,
} from "../evidence/integracao-regularize.mjs";
import { RH_PESSOAL_EVIDENCE } from "../evidence/rh-pessoal.mjs";
import {
  CERTIFICATE_EVIDENCE,
  PARCELAMENTO_EVIDENCE,
  SPECIALIZED_EVIDENCE,
  TECHNOLOGY_EVIDENCE,
} from "../evidence/technology-certificates-parcelamento.mjs";
import { V2_CLIENT_AUDITED_CORPORA, V2_EVIDENCE } from "../evidence/v2.mjs";
import { buildRuleRegistry as createRuleRegistry } from "../lib/mapping-contract.mjs";
import {
  ADMIN_BUSINESS_RULES,
  ADMIN_BUSINESS_TRANSFORMATIONS,
  buildIcmsResolutionContexts,
  buildPermissionResolutionContexts,
  createLegacyReferenceResolver,
  createV2ClientIdentityResolver,
  isAuthenticLegacyReferenceResolution,
  isAuthoritativeV2ClientIdentityResolution,
  isIssuedV2ClientIdentityResolution,
} from "./admin-business.mjs";
import { CERTIFICATE_RULES } from "./certificates.mjs";
import {
  buildClientPfResolutionContexts,
  buildGuidanceActivityPayload,
  buildIntegrationRegularizeReferenceContext,
  buildPartnerPairResolutionContexts,
  INTEGRACAO_REGULARIZE_RULES,
  normalizeClientPfSourceRow,
  resolveRegularizeReferringType,
} from "./integracao-regularize.mjs";
import { PARCELAMENTO_RULES } from "./parcelamento.mjs";
import {
  buildCbsStockCategoryContexts,
  buildCbsStockContexts,
  buildCbsStockEntryContexts,
  buildCbsStockExitContexts,
  buildCbsStockLocationContexts,
  buildMarketingPasswordContexts,
  buildMarketingSocialContexts,
  buildPecNoteContexts,
  buildRemainingReferenceContext,
  buildTriageClientSlotContexts,
  buildWorkspaceCategoryContexts,
  buildWorkspaceMessageContexts,
  buildWorkspaceRequestContexts,
  REMAINING_RULES,
} from "./remaining.mjs";
import { RH_PESSOAL_RULES } from "./rh-pessoal.mjs";
import { TECHNOLOGY_RULES } from "./tecnologia.mjs";
import { V2_RULES } from "./v2.mjs";

export {
  ADMIN_BUSINESS_EVIDENCE,
  ADMIN_BUSINESS_RULES,
  ADMIN_BUSINESS_TRANSFORMATIONS,
  buildClientPfResolutionContexts,
  buildIcmsResolutionContexts,
  buildGuidanceActivityPayload,
  buildPermissionResolutionContexts,
  buildIntegrationRegularizeReferenceContext,
  buildPartnerPairResolutionContexts,
  CERTIFICATE_EVIDENCE,
  CERTIFICATE_RULES,
  createLegacyReferenceResolver,
  createV2ClientIdentityResolver,
  isAuthoritativeV2ClientIdentityResolution,
  isAuthenticLegacyReferenceResolution,
  isIssuedV2ClientIdentityResolution,
  INTEGRACAO_REGULARIZE_AUDITED_CORPORA,
  INTEGRACAO_REGULARIZE_EVIDENCE,
  INTEGRACAO_REGULARIZE_RULES,
  INTEGRACAO_REGULARIZE_SOURCE_TABLES,
  normalizeClientPfSourceRow,
  PARCELAMENTO_EVIDENCE,
  PARCELAMENTO_RULES,
  buildRemainingReferenceContext,
  buildCbsStockCategoryContexts,
  buildCbsStockContexts,
  buildCbsStockEntryContexts,
  buildCbsStockExitContexts,
  buildCbsStockLocationContexts,
  buildMarketingPasswordContexts,
  buildMarketingSocialContexts,
  buildPecNoteContexts,
  buildTriageClientSlotContexts,
  buildWorkspaceCategoryContexts,
  buildWorkspaceMessageContexts,
  buildWorkspaceRequestContexts,
  REMAINING_RULES,
  RH_PESSOAL_EVIDENCE,
  RH_PESSOAL_RULES,
  resolveRegularizeReferringType,
  SPECIALIZED_EVIDENCE,
  TECHNOLOGY_EVIDENCE,
  TECHNOLOGY_RULES,
  V2_EVIDENCE,
  V2_CLIENT_AUDITED_CORPORA,
  V2_RULES,
};
export const v2Rules = V2_RULES;
export const adminBusinessRules = ADMIN_BUSINESS_RULES;
export const rhPessoalRules = RH_PESSOAL_RULES;
export const technologyRules = TECHNOLOGY_RULES;
export const certificateRules = CERTIFICATE_RULES;
export const parcelamentoRules = PARCELAMENTO_RULES;
export const remainingRules = REMAINING_RULES;

export function buildRuleRegistry(...additionalRuleGroups) {
  return createRuleRegistry([V2_RULES, ...additionalRuleGroups]);
}
