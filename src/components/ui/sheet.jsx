import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";

const Sheet = DialogPrimitive.Root;

function SheetContent({ side = "left", className, children, ...props }) {
  return <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50" />
    <DialogPrimitive.Content className={cn("fixed inset-y-0 z-50 flex h-full flex-col bg-white shadow-lg outline-none", side === "left" ? "left-0 border-r border-slate-200" : "right-0 border-l border-slate-200", className)} {...props}>
      {children}
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>;
}

const SheetTitle = DialogPrimitive.Title;
const SheetDescription = DialogPrimitive.Description;

export { Sheet, SheetContent, SheetTitle, SheetDescription };
