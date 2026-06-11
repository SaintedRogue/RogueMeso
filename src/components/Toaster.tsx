"use client";

import { useEffect, useState } from "react";
import { Check, AlertCircle } from "lucide-react";

type ToastType = "success" | "error";
type Toast = { id: number; message: string; type: ToastType };

const EVENT = "roguemeso:toast";
let seq = 0;

/**
 * Fire a toast from any client component. Uses a window CustomEvent (the same
 * decoupled pub/sub idiom as ThemeToggle) so callers don't need a context/provider.
 */
export function toast(message: string, type: ToastType = "success") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { message, type } }));
}

/** Mounted once in the root layout. Renders transient, screen-reader-announced toasts. */
export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    function onToast(e: Event) {
      const { message, type } = (e as CustomEvent<{ message: string; type: ToastType }>).detail;
      const id = ++seq;
      setToasts((prev) => [...prev, { id, message, type }]);
      window.setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
    }
    window.addEventListener(EVENT, onToast);
    return () => window.removeEventListener(EVENT, onToast);
  }, []);

  return (
    <div
      // aria-live so the message is announced; the region is always present (the
      // toasts mount into it) which is what screen readers need to pick up changes.
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-center gap-2 px-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] sm:pb-4"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className="toast-in pointer-events-auto flex max-w-sm items-center gap-2.5 rounded-xl border bg-panel px-4 py-2.5 text-sm shadow-lg"
          style={{
            borderColor: t.type === "error" ? "var(--color-bad)" : "var(--color-good)",
          }}
        >
          <span className={t.type === "error" ? "text-bad" : "text-good"} aria-hidden>
            {t.type === "error" ? <AlertCircle size={16} strokeWidth={2.25} /> : <Check size={16} strokeWidth={2.25} />}
          </span>
          <span className="text-text">{t.message}</span>
        </div>
      ))}
    </div>
  );
}
