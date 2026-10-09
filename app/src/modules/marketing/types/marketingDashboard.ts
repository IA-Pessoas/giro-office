export interface MarketingDashboardSummary {
  birthdayMonth: string;
  requests: {
    active: { total: number; rh: number; ti: number };
    new: { total: number; rh: number; ti: number };
    urgent: { total: number; rh: number; ti: number };
  };
  birthdays: {
    clients: BirthdayAggregate;
    employees: BirthdayAggregate;
    companies: BirthdayAggregate;
  };
  aiUsage: { competence: string; pendingKnowledge: number };
  alerts: Array<{ code: string; count: number; label: string }>;
}

interface BirthdayAggregate {
  total: number;
  items: BirthdayItem[];
}

export interface BirthdayItem {
  id: string;
  name: string;
  date: string;
  day: number;
  department?: string | null;
}

export interface MarketingEnvelope<T> {
  success: boolean;
  data: T;
}
