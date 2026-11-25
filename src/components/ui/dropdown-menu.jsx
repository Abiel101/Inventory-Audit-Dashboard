import * as React from "react";
import * as MenuPrimitive from "@radix-ui/react-dropdown-menu";
import { cn } from "@/lib/utils";

const DropdownMenu = MenuPrimitive.Root;
const DropdownMenuTrigger = MenuPrimitive.Trigger;

const DropdownMenuContent = React.forwardRef(({ className, sideOffset = 4, ...props }, ref) => (
  <MenuPrimitive.Portal>
    <MenuPrimitive.Content ref={ref} sideOffset={sideOffset} className={cn("z-50 min-w-[10rem] overflow-hidden rounded-lg border border-slate-200 bg-white p-1 shadow-lg", className)} {...props} />
  </MenuPrimitive.Portal>
));
DropdownMenuContent.displayName = "DropdownMenuContent";

const DropdownMenuItem = React.forwardRef(({ className, destructive, ...props }, ref) => (
  <MenuPrimitive.Item ref={ref} className={cn("flex cursor-pointer select-none items-center gap-2 rounded-md px-2 py-2 text-sm outline-none data-[highlighted]:bg-slate-100 [&_svg]:h-4 [&_svg]:w-4", destructive && "text-rose-600 data-[highlighted]:bg-rose-50", className)} {...props} />
));
DropdownMenuItem.displayName = "DropdownMenuItem";

const DropdownMenuSeparator = (props) => <MenuPrimitive.Separator className="my-1 h-px bg-slate-200" {...props} />;

export { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator };
