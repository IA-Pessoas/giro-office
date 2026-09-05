import type { ComponentProps, ReactNode } from "react";

import { cn } from "@shared/ui/newLayout/utils";

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

export function ReportSelect({
  className,
  ...props
}: ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-9 w-full rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100",
        className,
      )}
      {...props}
    />
  );
}

export const reportControlClassName =
  "rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";

export const reportMutedClassName = "text-sm text-gray-600 dark:text-slate-400";
