import { useEffect, useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

// Only the highlight pill animates. Bars that remount between layouts pass an `id` so the pill slides from its last position.
const lastIndex = new Map();

export function AnimatedTabs({ id, tabs, value, onChange, className, listClassName, triggerClassName }) {
  const index = Math.max(tabs.findIndex(([tabValue]) => tabValue === value), 0);
  const [shown, setShown] = useState(Math.min(id ? lastIndex.get(id) ?? index : index, tabs.length - 1));
  useEffect(() => {
    const frame = requestAnimationFrame(() => setShown(index));
    if (id) lastIndex.set(id, index);
    return () => cancelAnimationFrame(frame);
  }, [index, id]);
  return <Tabs value={value} onValueChange={onChange} className={className}>
    <TabsList className={cn("relative grid h-8 w-full border border-slate-200 bg-white p-0.5 text-xs", listClassName)} style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
      <span aria-hidden className="absolute inset-y-0.5 left-0.5 rounded-md bg-sky-600 shadow transition-transform duration-300 ease-out motion-reduce:transition-none" style={{ width: `calc((100% - 0.25rem) / ${tabs.length})`, transform: `translateX(${shown * 100}%)` }} />
      {tabs.map(([tabValue, label]) => <TabsTrigger key={tabValue} value={tabValue} className={cn("relative z-10 h-full rounded-md bg-transparent px-3 py-0 text-xs shadow-none transition-colors duration-300 data-[state=active]:bg-transparent data-[state=active]:text-white data-[state=active]:shadow-none data-[state=inactive]:text-slate-600 data-[state=inactive]:hover:text-slate-900", triggerClassName)}>{label}</TabsTrigger>)}
    </TabsList>
  </Tabs>;
}
