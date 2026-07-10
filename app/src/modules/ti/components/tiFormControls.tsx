import type { HTMLAttributes, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@shared/ui/newLayout/utils";

import {
  tiMutedPanelClassName,
  tiPanelClassName,
  tiPrimaryButtonClassName,
  tiSecondaryButtonClassName,
} from "./tiWorkspaceUi";

type TiEmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
};

type TiSectionHeaderProps = {
  title: string;
  description?: string;
  action?: ReactNode;
};

type TiIconActionProps = {
  icon: LucideIcon;
  label: string;
  variant?: "primary" | "secondary";
  disabled?: boolean;
  onClick?: () => void;
};

export function TiEmptyState({ icon: Icon, title, description, action }: TiEmptyStateProps) {
  return (
    <div className={cn(tiMutedPanelClassName, "flex flex-col items-start gap-4 sm:flex-row")}>
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white text-slate-700 shadow-sm dark:bg-slate-950 dark:text-slate-200">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <h3 className="text-base font-semibold text-slate-950 dark:text-white">{title}</h3>
        <p className="max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
          {description}
        </p>
        {action ? <div className="pt-2">{action}</div> : null}
      </div>
    </div>
  );
}

export function TiSectionHeader({ title, description, action }: TiSectionHeaderProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-1">
        <h2 className="text-xl font-semibold text-slate-950 dark:text-white">{title}</h2>
        {description ? (
          <p className="max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

type TiPanelProps = HTMLAttributes<HTMLElement> & {
  children: ReactNode;
};

export function TiPanel({ children, className, ...props }: TiPanelProps) {
  return (
    <section className={cn(tiPanelClassName, className)} {...props}>
      {children}
    </section>
  );
}

export function TiIconAction({
  icon: Icon,
  label,
  variant = "secondary",
  disabled,
  onClick,
}: TiIconActionProps) {
  return (
    <button
      type="button"
      className={variant === "primary" ? tiPrimaryButtonClassName : tiSecondaryButtonClassName}
      disabled={disabled}
      onClick={onClick}
      title={label}
    >
      <Icon className="h-4 w-4" />
      <span>{label}</span>
    </button>
  );
}
