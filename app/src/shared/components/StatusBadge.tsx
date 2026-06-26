import type { LucideIcon } from "lucide-react";

import { cn } from "../ui/newLayout/utils";

export type StatusBadgeVariant =
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "neutral"
  | "purple"
  | "orange";

export type StatusBadgeConfig = {
  label: string;
  variant: StatusBadgeVariant;
  icon?: LucideIcon;
};

export type StatusBadgeSize = "sm" | "md";

export type StatusBadgeProps = {
  config: StatusBadgeConfig;
  showLabel?: boolean;
  size?: StatusBadgeSize;
  className?: string;
};

const statusBadgeVariantClassNames: Record<StatusBadgeVariant, string> = {
  success: "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300",
  warning: "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300",
  danger: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300",
  info: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300",
  neutral: "bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-200",
  purple: "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300",
  orange: "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300",
};

const statusBadgeSizeClassNames: Record<StatusBadgeSize, string> = {
  sm: "px-2 py-0.5 text-xs",
  md: "px-2.5 py-1 text-xs",
};

export function StatusBadge({
  config,
  showLabel = true,
  size = "md",
  className,
}: StatusBadgeProps) {
  const Icon = config.icon;

  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1 rounded-full font-medium",
        statusBadgeSizeClassNames[size],
        statusBadgeVariantClassNames[config.variant],
        className,
      )}
    >
      {Icon ? <Icon aria-hidden="true" className="h-3 w-3 shrink-0" /> : null}
      {showLabel ? config.label : <span className="sr-only">{config.label}</span>}
    </span>
  );
}
