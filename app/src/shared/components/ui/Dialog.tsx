import * as DialogPrimitive from "@radix-ui/react-dialog";
import { IoClose } from "react-icons/io5";
import type { ReactNode } from "react";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  contentClassName?: string;
  bodyClassName?: string;
}

export function Dialog({
  open,
  onOpenChange,
  title,
  description = "Dialog content",
  children,
  footer,
  contentClassName = "",
  bodyClassName = "",
}: DialogProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[1400] bg-black/60 backdrop-blur-sm" />
        <DialogPrimitive.Content
          className={`fixed left-1/2 top-1/2 z-[1500] w-[min(92vw,680px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-gray-200 bg-white p-0 text-gray-900 shadow-lg focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:[color-scheme:dark] ${contentClassName}`}
        >
          <header className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-700">
            <DialogPrimitive.Title className="text-lg font-semibold text-[var(--colors-blue-500)] dark:text-white">
              {title}
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">{description}</DialogPrimitive.Description>
            <DialogPrimitive.Close
              className="rounded-md p-1 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--colors-blue-500)] dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white"
              aria-label="Fechar"
            >
              <IoClose className="h-5 w-5" />
            </DialogPrimitive.Close>
          </header>
          <div className={`px-5 py-4 ${bodyClassName}`}>{children}</div>
          {footer ? (
            <footer className="flex justify-end gap-2 border-t border-gray-200 px-5 py-4 dark:border-gray-700">
              {footer}
            </footer>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
