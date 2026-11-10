import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

const TransitionContext = createContext((_label, action) => action?.());

const ENTER_MS = 350;
const HOLD_MS = 900;
const EXIT_MS = 400;

export function TransitionProvider({ children }) {
  const [state, setState] = useState(null);
  const busy = useRef(false);
  const timers = useRef([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const run = useCallback((label, action, { detail = "" } = {}) => {
    if (busy.current) return;
    busy.current = true;
    const later = (fn, ms) => timers.current.push(setTimeout(fn, ms));
    setState({ label, detail, phase: "enter" });
    requestAnimationFrame(() => requestAnimationFrame(() => setState((s) => s && { ...s, phase: "hold" })));
    later(() => { try { action?.(); } catch (error) { console.error(error); } }, ENTER_MS);
    later(() => setState((s) => s && { ...s, phase: "exit" }), ENTER_MS + HOLD_MS);
    later(() => { setState(null); busy.current = false; }, ENTER_MS + HOLD_MS + EXIT_MS);
  }, []);
  const value = useMemo(() => run, [run]);
  const visible = state?.phase === "hold";

  return <TransitionContext.Provider value={value}>
    {children}
    {state && <div className={`fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/60 backdrop-blur-2xl backdrop-saturate-50 transition-opacity ease-out ${visible ? "opacity-100" : "opacity-0"}`} style={{ transitionDuration: `${state.phase === "exit" ? EXIT_MS : ENTER_MS}ms` }} role="alert" aria-live="assertive" aria-busy="true">
      <div className={`w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white p-6 text-center shadow-2xl transition-all ease-out ${visible ? "translate-y-0 scale-100 opacity-100" : state.phase === "exit" ? "-translate-y-6 scale-95 opacity-0" : "translate-y-6 scale-95 opacity-0"}`} style={{ transitionDuration: `${state.phase === "exit" ? EXIT_MS : ENTER_MS}ms` }}>
        <p className="font-semibold text-slate-900">{state.label}</p>
        {state.detail && <p className="mt-1 text-sm text-slate-500">{state.detail}</p>}
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-sky-600" style={{ width: state.phase === "enter" ? "0%" : "100%", transition: `width ${ENTER_MS + HOLD_MS}ms cubic-bezier(0.4, 0, 0.2, 1)` }} /></div>
      </div>
    </div>}
  </TransitionContext.Provider>;
}

export const useTransition = () => useContext(TransitionContext);
