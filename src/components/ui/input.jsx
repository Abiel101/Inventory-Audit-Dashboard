import { cn } from "@/lib/utils";

function Input({ className, ...props }) {
  return <input className={cn("flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-offset-white placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:opacity-50", className)} {...props} />;
}

export { Input };
