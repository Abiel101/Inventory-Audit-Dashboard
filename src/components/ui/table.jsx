import { cn } from "@/lib/utils";

function Table({ className, wrapperRef, wrapperStyle, ...props }) { return <div ref={wrapperRef} style={wrapperStyle} className="relative w-full overflow-auto"><table className={cn("w-full caption-bottom text-xs", className)} {...props} /></div>; }
function TableHeader({ className, ...props }) { return <thead className={cn("[&_tr]:border-b", className)} {...props} />; }
function TableBody({ className, ...props }) { return <tbody className={cn("[&_tr:last-child]:border-0", className)} {...props} />; }
function TableRow({ className, ...props }) { return <tr className={cn("border-b transition-colors hover:bg-slate-50", className)} {...props} />; }
function TableHead({ className, ...props }) { return <th className={cn("sticky top-0 z-10 h-8 bg-white px-2 text-left align-middle text-[11px] font-medium text-slate-500", className)} {...props} />; }
function TableCell({ className, ...props }) { return <td className={cn("px-2 py-1.5 align-middle", className)} {...props} />; }
export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell };
