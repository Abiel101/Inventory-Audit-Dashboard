import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

const ToastContext = createContext(() => {});

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(0);
  const toast = useCallback((message, { variant = "default", duration = 3500 } = {}) => {
    const id = nextId.current++;
    setToasts((current) => [...current, { id, message, variant }]);
    setTimeout(() => setToasts((current) => current.filter((item) => item.id !== id)), duration);
  }, []);
  const value = useMemo(() => toast, [toast]);
  return <ToastContext.Provider value={value}>
    {children}
    <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2" role="status" aria-live="polite">
      {toasts.map(({ id, message, variant }) => <div key={id} className={`pointer-events-auto rounded-lg border px-4 py-3 text-sm shadow-lg ${variant === "error" ? "border-rose-300 bg-rose-50 text-rose-900" : variant === "success" ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-slate-200 bg-white text-slate-900"}`}>{message}</div>)}
    </div>
  </ToastContext.Provider>;
}

export const useToast = () => useContext(ToastContext);
