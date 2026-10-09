export interface MarketingDashboardSummary {
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
  items: Array<{ id: string; name: string; day: number }>;
}

export interface MarketingBirthdayPerson {
  id: string;
  name: string;
  birthDate: string;
  day: number;
}

export interface MarketingMonthlyBirthdays {
  month: number;
  employees: {
    total: number;
    items: Array<MarketingBirthdayPerson & { department: string | null }>;
  };
  clients: {
    total: number;
    items: Array<MarketingBirthdayPerson & { companies: string }>;
  };
}

export interface MarketingEnvelope<T> {
  success: boolean;
  data: T;
}
