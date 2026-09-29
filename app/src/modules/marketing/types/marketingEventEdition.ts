export interface MarketingEventEditionBudgetItem {
  id: string;
  name: string;
  amount: string;
  position: number;
}

export type MarketingEditionLists = Record<string, string[]>;

export interface MarketingEventEditionPayload {
  name: string;
  date: string;
  place: string;
  budgetItems: Array<{ name: string; amount: string }>;
  partnerships: string[];
  organizingTeam: string[];
  logistics: MarketingEditionLists;
  marketingCommunication: MarketingEditionLists;
  duringEvent: MarketingEditionLists;
  afterEvent: MarketingEditionLists;
  notes: string;
  feedbackPeriodStart: string | null;
  feedbackPeriodEnd: string | null;
}

export interface MarketingEventEdition extends Omit<MarketingEventEditionPayload, "budgetItems"> {
  id: string;
  eventId: string;
  budgetItems: MarketingEventEditionBudgetItem[];
  budgetTotal: string;
  feedback: MarketingEventEditionFeedback | null;
}

export interface MarketingEventEditionFeedback {
  rating: number;
  observation: string | null;
  evaluatedAt: string;
}

export interface MarketingEventEditionReport {
  event: {
    id: string;
    name: string;
    logo: string;
    status: string;
    priority: string;
    objective: string;
    audience: string;
  };
  edition: MarketingEventEdition;
}
