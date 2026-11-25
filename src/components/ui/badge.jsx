import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center rounded-full border whitespace-nowrap px-2 py-0 text-[11px] font-semibold leading-5", {
  variants: {
    variant: {
      default: "border-transparent bg-sky-100 text-sky-800",
      secondary: "border-transparent bg-slate-100 text-slate-700",
      success: "border-transparent bg-emerald-100 text-emerald-800",
      indigo: "border-transparent bg-indigo-100 text-indigo-900",
      warning: "border-transparent bg-amber-100 text-amber-800",
      destructive: "border-transparent bg-rose-100 text-rose-800",
    },
  },
  defaultVariants: { variant: "default" },
});
function Badge({ className, variant, ...props }) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
export { Badge };
