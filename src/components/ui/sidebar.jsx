import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva } from "class-variance-authority";
import { PanelLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const SIDEBAR_STORAGE_KEY = "inventory-audit-sidebar-open";
const SIDEBAR_WIDTH = "16rem";
const MOBILE_QUERY = "(max-width: 767px)";

const SidebarContext = createContext(null);

function useSidebar() {
  const context = useContext(SidebarContext);
  if (!context) throw new Error("useSidebar must be used within a SidebarProvider.");
  return context;
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.matchMedia(MOBILE_QUERY).matches);
  useEffect(() => {
    const query = window.matchMedia(MOBILE_QUERY);
    const onChange = () => setIsMobile(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return isMobile;
}

function SidebarProvider({ defaultOpen = true, className, style, children, ...props }) {
  const isMobile = useIsMobile();
  const [openMobile, setOpenMobile] = useState(false);
  const [open, setOpenState] = useState(() => {
    try { const saved = localStorage.getItem(SIDEBAR_STORAGE_KEY); return saved === null ? defaultOpen : saved === "true"; } catch { return defaultOpen; }
  });
  const setOpen = useCallback((value) => {
    setOpenState((current) => {
      const next = typeof value === "function" ? value(current) : value;
      try { localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next)); } catch { /* state still applies for this session */ }
      return next;
    });
  }, []);
  const toggleSidebar = useCallback(() => (isMobile ? setOpenMobile((current) => !current) : setOpen((current) => !current)), [isMobile, setOpen]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key.toLowerCase() === "b" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); toggleSidebar(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleSidebar]);

  return <SidebarContext.Provider value={{ state: open ? "expanded" : "collapsed", open, setOpen, isMobile, openMobile, setOpenMobile, toggleSidebar }}>
    <div style={{ "--sidebar-width": SIDEBAR_WIDTH, ...style }} className={cn("group/sidebar-wrapper flex min-h-svh w-full", className)} {...props}>{children}</div>
  </SidebarContext.Provider>;
}

function Sidebar({ className, children, ...props }) {
  const { isMobile, state, openMobile, setOpenMobile } = useSidebar();
  if (isMobile) {
    return <Sheet open={openMobile} onOpenChange={setOpenMobile}>
      <SheetContent side="left" className="w-[var(--sidebar-width)] bg-sidebar p-0 text-sidebar-foreground" style={{ "--sidebar-width": SIDEBAR_WIDTH }}>
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <SheetDescription className="sr-only">Application navigation</SheetDescription>
        <div className="flex h-full w-full flex-col">{children}</div>
      </SheetContent>
    </Sheet>;
  }
  return <div data-state={state} className="group peer hidden text-sidebar-foreground md:block" {...props}>
    <div className="w-[var(--sidebar-width)] bg-transparent transition-[width] duration-200 ease-linear group-data-[state=collapsed]:w-0" />
    <div className={cn("fixed inset-y-0 left-0 z-30 hidden h-svh w-[var(--sidebar-width)] border-r border-sidebar-border bg-sidebar transition-[left] duration-200 ease-linear md:flex group-data-[state=collapsed]:left-[calc(var(--sidebar-width)*-1)]", className)}>
      <div className="flex h-full w-full flex-col">{children}</div>
    </div>
  </div>;
}

function SidebarTrigger({ className, onClick, ...props }) {
  const { toggleSidebar } = useSidebar();
  return <Button variant="ghost" size="icon" className={className} aria-label="Toggle sidebar" title="Toggle sidebar (Ctrl+B)" onClick={(event) => { onClick?.(event); toggleSidebar(); }} {...props}><PanelLeft className="h-4 w-4" /></Button>;
}

function SidebarInset({ className, ...props }) {
  return <main className={cn("relative flex min-h-svh min-w-0 flex-1 flex-col bg-slate-50", className)} {...props} />;
}

const section = (name, base) => function Section({ className, ...props }) { return <div data-sidebar={name} className={cn(base, className)} {...props} />; };
const SidebarHeader = section("header", "flex flex-col gap-2 p-5");
const SidebarFooter = section("footer", "flex flex-col gap-2 p-4");
const SidebarContent = section("content", "flex min-h-0 flex-1 flex-col gap-2 overflow-hidden px-3");
const SidebarGroup = section("group", "relative flex w-full min-w-0 flex-col p-2");

function SidebarMenu({ className, ...props }) { return <ul className={cn("flex w-full min-w-0 flex-col gap-1", className)} {...props} />; }
function SidebarMenuItem({ className, ...props }) { return <li className={cn("relative", className)} {...props} />; }

const menuButtonVariants = cva("flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sidebar-ring hover:bg-slate-100 [&>svg]:h-4 [&>svg]:w-4 [&>svg]:shrink-0", {
  variants: { active: { true: "bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent", false: "" } },
  defaultVariants: { active: false },
});

function SidebarMenuButton({ asChild = false, isActive = false, className, ...props }) {
  const Comp = asChild ? Slot : "button";
  return <Comp data-active={isActive} className={cn(menuButtonVariants({ active: isActive }), className)} {...props} />;
}

export { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger, useSidebar };
