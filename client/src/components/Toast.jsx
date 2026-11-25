import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

const ToastContext = createContext({ toast: () => {} });
export const useToast = () => useContext(ToastContext);

const TONES = {
  success: 'border-green-300 bg-green-50 text-green-900',
  error: 'border-[#f4b5b0] bg-[#fee4e2] text-[#912018]',
  info: 'border-line bg-white text-ink',
};

// Toasts live in a polite live region so screen readers hear them without being interrupted.
export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const nextId = useRef(1);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setItems((list) => list.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message, { tone = 'success', ms = 4000 } = {}) => {
      const id = nextId.current++;
      setItems((list) => [...list.slice(-3), { id, message, tone }]);
      timers.current.set(id, setTimeout(() => dismiss(id), ms));
    },
    [dismiss],
  );

  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div aria-live="polite" role="status" className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4 print:hidden">
        {items.map((t) => (
          <div key={t.id} className={`toast-in pointer-events-auto flex max-w-md items-start gap-3 rounded-xl border px-4 py-3 text-[13px] font-semibold shadow-lg ${TONES[t.tone] || TONES.info}`}>
            <span>{t.message}</span>
            <button type="button" onClick={() => dismiss(t.id)} aria-label="Dismiss message" className="-my-1 -mr-2 grid h-8 w-8 shrink-0 place-items-center rounded-lg opacity-70 hover:opacity-100">
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
