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
  alerts: Array<{ code: string; count: number; label: string }>;
}

interface BirthdayAggregate {
  total: number;
  items: Array<{ id: string; name: string; day: number }>;
}

export interface MarketingEnvelope<T> {
  success: boolean;
  data: T;
}
