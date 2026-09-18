export {
  TriageCompetenceSection,
  TriageExternalLinksSection,
  TriageUrgentRequestsSection,
} from "./components";
export {
  triagemCompetencesQueryKey,
  useTriageCompetenceMutations,
  useTriageCompetences,
  triagemExternalLinksQueryKey,
  useTriageExternalLinkMutations,
  useTriageExternalLinks,
} from "./hooks";
export { triagemCompetenceService } from "./services";
export { triagemExternalLinkService } from "./services";
export { triagemUrgentRequestService } from "./services";
export type {
  TriageCompetence,
  TriageExternalLink,
  TriageExternalLinkInput,
  TriageExternalLinkType,
  TriageUrgentRequest,
  TriageUrgentRequestInput,
  TriageUrgentRequestStatus,
  TriageUrgencyCode,
} from "./services";
