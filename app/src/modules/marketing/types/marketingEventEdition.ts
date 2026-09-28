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
}

export interface MarketingEventEdition extends Omit<MarketingEventEditionPayload, "budgetItems"> {
  id: string;
  eventId: string;
  budgetItems: MarketingEventEditionBudgetItem[];
  budgetTotal: string;
}
