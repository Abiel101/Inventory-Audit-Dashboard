import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

export function ItemSheet({ item, onClose }) {
  const fields = item ? [
    ["SKU", item.sku],
    ["Style", item.style],
    ["Case code", item.category],
    ["Price", typeof item.price === "number" ? item.price.toLocaleString("en-US", { style: "currency", currency: "USD" }) : null],
    ["Expected", item.expected],
    ["Scanned", item.scanned],
    ["Sales floor", item.salesFloor],
    ["Locations", item.locations],
  ] : [];
  return <Sheet open={!!item} onOpenChange={(open) => !open && onClose()}>
    <SheetContent className="overflow-y-auto sm:max-w-md">
      {item && <div className="flex flex-col gap-5 pt-6">
        <Skeleton className="h-56 w-full rounded-lg" aria-label="Item image placeholder" />
        <div className="text-right">
          <SheetTitle className="text-lg">{item.description || item.sku}</SheetTitle>
          <SheetDescription className="sr-only">Details for item {item.sku}</SheetDescription>
          {item.issue && <Badge className="mt-2 bg-indigo-100 text-indigo-800 hover:bg-indigo-100">Known issue</Badge>}
        </div>
        <dl className="divide-y divide-slate-200 text-right text-sm">
          {fields.map(([label, value]) => <div key={label} className="grid grid-cols-[auto_1fr] gap-4 py-2"><dt className="text-slate-500">{label}</dt><dd className="break-words font-medium">{value === null || value === undefined || value === "" ? "—" : String(value)}</dd></div>)}
        </dl>
        {item.issue && <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-right text-sm text-indigo-900"><p className="text-xs font-semibold uppercase tracking-wide">Known issue · qty {item.issue.quantity}</p><p className="mt-1 whitespace-pre-wrap">{item.issue.note}</p></div>}
        {item.auditNote && <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-right text-sm"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Audit note</p><p className="mt-1 whitespace-pre-wrap">{item.auditNote}</p></div>}
      </div>}
    </SheetContent>
  </Sheet>;
}
