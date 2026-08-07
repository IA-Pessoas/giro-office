import { getProjectProgressWidthClassName } from "./projectUi";

export function ProjectProgressBar({ progress }: { progress: number }) {
  const clampedProgress = Number.isFinite(progress) ? Math.max(0, Math.min(100, progress)) : 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
        <span>Progresso</span>
        <span>{clampedProgress}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
        <div
          className={`h-full rounded-full bg-gradient-to-r from-[var(--colors-brand-gradient-start)] to-[var(--colors-brand-gradient-end)] transition-all ${getProjectProgressWidthClassName(
            clampedProgress,
          )}`}
        />
      </div>
    </div>
  );
}
