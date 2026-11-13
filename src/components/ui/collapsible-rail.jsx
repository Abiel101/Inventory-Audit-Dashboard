import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const dotTone = { success: "bg-emerald-500", danger: "bg-red-500", warning: "bg-amber-500", neutral: "bg-slate-400" };

export const desktopDefaultOpen = () => typeof window === "undefined" || window.matchMedia("(min-width: 1024px)").matches;

// A self-contained side panel: expanded it shows `children`; collapsed it shrinks to a narrow rail of status dots.
// Open width is fixed (`width`) so it never changes as content is added. An edge arrow toggles it. Place it in a flex row beside a `min-w-0 flex-1` sibling, which absorbs the freed width.
// dots: [{ id, label, tone: "success" | "danger" | "warning" | "neutral" }]
export function CollapsibleRail({ title, dots = [], emptyText = "Nothing yet", children, open: controlledOpen, onOpenChange, defaultOpen = desktopDefaultOpen, width = "15rem", className, contentClassName }) {
  const [innerOpen, setInnerOpen] = useState(defaultOpen);
  const open = controlledOpen ?? innerOpen;
  const toggle = () => { const next = !open; setInnerOpen(next); onOpenChange?.(next); };
  const label = `${open ? "Hide" : "Show"} ${title.toLowerCase()}`;
  return <div style={{ width: open ? width : "3rem", maxWidth: open ? "70vw" : undefined }} className={cn("relative shrink-0 transition-[width] duration-300 ease-out motion-reduce:transition-none", className)}>
    <Card className="relative min-h-[100px] overflow-hidden">
      <div aria-hidden={open} className={cn("absolute inset-y-0 left-0 flex w-12 flex-col items-center gap-2.5 pt-4 transition-[opacity,visibility] duration-300", open ? "invisible opacity-0" : "visible opacity-100")}>
        {dots.map((dot) => <span key={dot.id} title={dot.label} className={cn("h-2.5 w-2.5 rounded-full", dotTone[dot.tone] ?? dotTone.neutral)} />)}
      </div>
      <div aria-hidden={!open} style={{ width }} className={cn("transition-[opacity,visibility] duration-300", open ? "visible opacity-100" : "invisible opacity-0")}>
        <CardHeader className="p-3 pb-1"><CardTitle className="text-sm">{title}</CardTitle></CardHeader>
        <CardContent className={cn("p-3 pt-0 text-[11px] leading-tight", contentClassName)}>{children ?? <p className="text-slate-400">{emptyText}</p>}</CardContent>
      </div>
    </Card>
    <button type="button" aria-expanded={open} aria-label={label} title={label} onClick={toggle} className="absolute -right-3 top-1/2 z-10 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full border border-slate-300 bg-white text-slate-600 shadow-sm hover:bg-slate-100"><ChevronRight className={cn("h-4 w-4 transition-transform duration-300 motion-reduce:transition-none", open && "rotate-180")} /></button>
  </div>;
}
