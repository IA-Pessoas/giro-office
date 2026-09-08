import type { ReactNode } from "react";

export function ReportStep({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-5" aria-labelledby="report-step-title">
      <div>
        <h2 id="report-step-title" className="text-xl font-semibold text-gray-900 dark:text-white">
          {title}
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-gray-600 dark:text-slate-400">{description}</p>
      </div>
      {children}
    </section>
  );
}
