import * as DialogPrimitive from "@radix-ui/react-dialog";
import { IoClose } from "react-icons/io5";
import type { ComponentProps, ReactNode, Ref } from "react";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  overlayClassName?: string;
  contentClassName?: string;
  bodyClassName?: string;
  contentRef?: Ref<HTMLDivElement>;
  preventClose?: boolean;
  onCloseAutoFocus?: ComponentProps<typeof DialogPrimitive.Content>["onCloseAutoFocus"];
}

export function Dialog({
  open,
  onOpenChange,
  title,
  description = "Dialog content",
  children,
  footer,
  overlayClassName = "",
  contentClassName = "",
  bodyClassName = "",
  contentRef,
  preventClose = false,
  onCloseAutoFocus,
}: DialogProps) {
  const handleOpenChange = (nextOpen: boolean) => {
    if (preventClose && !nextOpen) {
      return;
    }

    onOpenChange(nextOpen);
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={`fixed inset-0 z-[1400] bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:duration-150 motion-reduce:animate-none ${overlayClassName}`}
        />
        <DialogPrimitive.Content
          ref={contentRef}
          onCloseAutoFocus={onCloseAutoFocus}
          onEscapeKeyDown={(event) => {
            if (preventClose) {
              event.preventDefault();
            }
          }}
          onPointerDownOutside={(event) => {
            if (preventClose) {
              event.preventDefault();
            }
          }}
          className={`fixed left-1/2 top-1/2 z-[1500] flex max-h-[calc(100dvh-2rem)] w-[min(92vw,680px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white p-0 text-gray-900 shadow-lg focus:outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:duration-200 motion-reduce:animate-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:[color-scheme:dark] ${contentClassName}`}
        >
          <header className="flex shrink-0 items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-700">
            <DialogPrimitive.Title className="dialog-neutral-title text-lg font-semibold text-black dark:text-white">
              {title}
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">{description}</DialogPrimitive.Description>
            <DialogPrimitive.Close
              disabled={preventClose}
              className="rounded-md p-1 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--colors-blue-500)] dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white"
              aria-label="Fechar"
            >
              <IoClose className="h-5 w-5" />
            </DialogPrimitive.Close>
          </header>
          <div
            className={`min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 ${bodyClassName}`}
          >
            {children}
          </div>
          {footer ? (
            <footer className="flex shrink-0 justify-end gap-2 border-t border-gray-200 px-5 py-4 dark:border-gray-700">
              {footer}
            </footer>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
