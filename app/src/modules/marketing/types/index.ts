export interface MarketingDashboardSummary {
  totalBudgets: number;
  pendingBudgets: number;
  approvedBudgets: number;
  rejectedBudgets: number;
  purchasedBudgets: number;
  totalBudgetValue: number;
  marketingPasswords: number;
}

export interface MarketingBudgetStatusItem {
  status: string;
  count: number;
}

export interface MarketingSpendingDestinationItem {
  destination: string;
  total: number;
}

export interface MarketingBudgetRow {
  id: string;
  title: string;
  status: string;
  totalValue: number;
  createdAt: string | null;
}

export interface MarketingPasswordRow {
  id: string;
  local: string;
  user: string;
  updatedAt: string | null;
}

export interface MarketingDashboardStats {
  summary: MarketingDashboardSummary;
  budgetsByStatus: MarketingBudgetStatusItem[];
  spendingByDestination: MarketingSpendingDestinationItem[];
  recentBudgets: MarketingBudgetRow[];
  marketingPasswords: {
    total: number;
    recent: MarketingPasswordRow[];
  };
}
