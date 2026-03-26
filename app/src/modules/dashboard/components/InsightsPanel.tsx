import React from "react";
import { AlertCircle } from "lucide-react";

import type { DashboardInsight, DashboardStats } from "../types";

interface InsightsPanelProps {
  insights: DashboardStats['insights'];
}

function schemeFromType(type: DashboardInsight['type']) {
  if (type === "warning") return "bg-yellow-50 dark:bg-yellow-900/30 text-yellow-900 dark:text-yellow-200";
  if (type === "success") return "bg-green-50 dark:bg-green-900/30 text-green-900 dark:text-green-200";
  return "bg-blue-50 dark:bg-blue-900/30 text-blue-900 dark:text-blue-200";
}

export function InsightsPanel({ insights }: InsightsPanelProps) {
  return (
    <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-6">
        <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400" />
        Insights e Alertas
      </h3>

      <div className="grid grid-cols-1 gap-3">
        {insights.map((insight, idx) => (
          <article
            key={`${insight.title}-${idx}`}
            className={`rounded-lg border border-gray-200 dark:border-gray-700 p-4 ${schemeFromType(insight.type)}`}
            role="status"
          >
            <p className="text-sm font-semibold">{insight.title}</p>
            <p className="text-sm opacity-90">{insight.description}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

