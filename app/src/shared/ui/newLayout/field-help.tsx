"use client";

import { Info } from "lucide-react";
import { useId } from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

export function FieldHelp({
  label,
  description,
  container,
}: {
  label: string;
  description: string;
  container?: HTMLElement | null;
}) {
  const descriptionId = useId();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={`Ajuda: ${label}`}
          aria-describedby={descriptionId}
          className="inline-flex h-4 w-4 items-center justify-center rounded-full text-gray-400 transition-colors hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-gray-500 dark:hover:text-blue-300"
        >
          <Info aria-hidden="true" className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent
        id={descriptionId}
        side="top"
        align="start"
        container={container}
        collisionBoundary={container ?? undefined}
        collisionPadding={container ? 8 : undefined}
        className="max-w-xs leading-5"
      >
        {description}
      </TooltipContent>
    </Tooltip>
  );
}
