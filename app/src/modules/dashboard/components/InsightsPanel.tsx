import React from 'react';
import type { DashboardStats, DashboardInsight } from '../types';

interface InsightsPanelProps {
  insights: DashboardStats['insights'];
}

function schemeFromType(type: DashboardInsight['type']) {
  if (type === 'warning') return 'border-yellow-300 bg-yellow-50 text-yellow-900';
  if (type === 'success') return 'border-green-300 bg-green-50 text-green-900';
  return 'border-sky-300 bg-sky-50 text-sky-900';
}

export function InsightsPanel({ insights }: InsightsPanelProps) {
  return (
    <section className="dashboard-card">
      <h3 className="dashboard-card-title mb-4">
        Insights e Alertas
      </h3>

      <div className="grid grid-cols-1 gap-3">
        {insights.map((insight, idx) => (
          <article
            key={`${insight.title}-${idx}`}
            className={`rounded-md border p-3 ${schemeFromType(insight.type)}`}
            role="status"
          >
            <p className="text-sm font-semibold">{insight.title}</p>
            <p className="text-sm">{insight.description}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

