export {
  TriageCompetenceSection,
  TriageExternalLinksSection,
  TriageUrgentRequestsSection,
  TriageCatalogSection,
} from "./components";
export {
  triagemCompetencesQueryKey,
  useTriageCompetenceMutations,
  useTriageCompetences,
  triagemExternalLinksQueryKey,
  useTriageExternalLinkMutations,
  useTriageExternalLinks,
  triagemCatalogsQueryKey,
  useTriageCatalogMutations,
  useTriageCatalogs,
} from "./hooks";
export { triagemCompetenceService } from "./services";
export { triagemExternalLinkService } from "./services";
export { triagemUrgentRequestService } from "./services";
export { triagemCatalogService } from "./services";
export type {
  TriageCompetence,
  TriageExternalLink,
  TriageExternalLinkInput,
  TriageExternalLinkType,
  TriageUrgentRequest,
  TriageUrgentRequestInput,
  TriageUrgentRequestStatus,
  TriageUrgencyCode,
  TriageCatalogInput,
  TriageCatalogItem,
  TriageCatalogKind,
} from "./services";
