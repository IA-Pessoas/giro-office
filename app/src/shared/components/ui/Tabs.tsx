import * as TabsPrimitive from "@radix-ui/react-tabs";
import type { ReactNode } from "react";

interface TabsRootProps {
  defaultValue: string;
  children: ReactNode;
}

export function TabsRoot({ defaultValue, children }: TabsRootProps) {
  return <TabsPrimitive.Root defaultValue={defaultValue}>{children}</TabsPrimitive.Root>;
}

interface TabsListProps {
  children: ReactNode;
}

export function TabsList({ children }: TabsListProps) {
  return (
    <TabsPrimitive.List className="inline-flex items-center gap-1 rounded-lg border border-black/10 bg-white p-1 shadow-sm" aria-label="Section tabs">
      {children}
    </TabsPrimitive.List>
  );
}

interface TabsTriggerProps {
  value: string;
  children: ReactNode;
}

export function TabsTrigger({ value, children }: TabsTriggerProps) {
  return (
    <TabsPrimitive.Trigger
      value={value}
      className="rounded-md px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 data-[state=active]:bg-[var(--colors-blue-500)] data-[state=active]:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--colors-blue-500)]"
    >
      {children}
    </TabsPrimitive.Trigger>
  );
}

interface TabsContentProps {
  value: string;
  children: ReactNode;
}

export function TabsContent({ value, children }: TabsContentProps) {
  return (
    <TabsPrimitive.Content value={value} className="mt-4">
      {children}
    </TabsPrimitive.Content>
  );
}
