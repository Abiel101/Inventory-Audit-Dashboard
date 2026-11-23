import { useEffect, useRef, useState } from "react";
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
  const contentRef = useRef(null);
  const [openHeight, setOpenHeight] = useState();
  useEffect(() => {
    const node = contentRef.current;
    if (!node) return undefined;
    const measure = () => setOpenHeight(node.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  // 8px dots, 6px gaps, 10px vertical padding; never shorter than the arrow button.
  const closedHeight = Math.max(44, dots.length * 8 + Math.max(dots.length - 1, 0) * 6 + 20);
  const label = `${open ? "Hide" : "Show"} ${title.toLowerCase()}`;
  return <div style={{ width: open ? width : "2rem", maxWidth: open ? "70vw" : undefined }} className={cn("relative shrink-0 transition-[width] duration-300 ease-out motion-reduce:transition-none", className)}>
    <Card style={{ height: open ? openHeight : closedHeight }} className={cn("relative overflow-hidden transition-[height] duration-300 ease-out motion-reduce:transition-none", open && openHeight === undefined && "min-h-[100px]")}>
      <div aria-hidden={open} className={cn("absolute inset-0 flex flex-col items-center justify-center gap-[6px]", open && "pointer-events-none")}>
        {dots.map((dot, index) => <span key={dot.id} title={dot.label} style={{ transitionDelay: open ? "0ms" : `${150 + Math.min(index, 12) * 35}ms` }} className={cn("h-2 w-2 rounded-full transition-[opacity,transform] ease-out motion-reduce:transition-none", open ? "translate-y-2 opacity-0 duration-150" : "translate-y-0 opacity-100 duration-300", dotTone[dot.tone] ?? dotTone.neutral)} />)}
      </div>
      <div ref={contentRef} aria-hidden={!open} style={{ width }} className={cn("transition-[opacity,visibility] duration-300", open ? "visible opacity-100" : "invisible opacity-0")}>
        <CardHeader className="p-3 pb-1"><CardTitle className="text-sm">{title}</CardTitle></CardHeader>
        <CardContent className={cn("p-3 pt-0 text-[11px] leading-tight", contentClassName)}>{children ?? <p className="text-slate-400">{emptyText}</p>}</CardContent>
      </div>
    </Card>
    <button type="button" aria-expanded={open} aria-label={label} title={label} onClick={toggle} className="absolute -right-3 top-1/2 z-10 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full border border-slate-300 bg-white text-slate-600 shadow-sm hover:bg-slate-100"><ChevronRight className={cn("h-4 w-4 transition-transform duration-300 motion-reduce:transition-none", open && "rotate-180")} /></button>
  </div>;
}
