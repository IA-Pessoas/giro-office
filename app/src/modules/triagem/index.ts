export { TriageCompetenceSection, TriageExternalLinksSection } from "./components";
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
export type {
  TriageCompetence,
  TriageExternalLink,
  TriageExternalLinkInput,
  TriageExternalLinkType,
} from "./services";
