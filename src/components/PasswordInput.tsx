"use client";

import { useState, type ComponentPropsWithoutRef } from "react";
import { Eye, EyeOff } from "lucide-react";

/**
 * A password field with a show/hide toggle. Drops into any form (server- or client-rendered)
 * as a leaf: it forwards every native input prop, so `name`/`autoComplete`/`required` reach
 * the server action untouched. The reveal button is `type="button"` (never submits) and out of
 * the tab order so keyboard users flow straight from one field to the next. Mirrors the
 * decoupled, hook-local pattern of ThemeToggle.
 */
export function PasswordInput({ className = "", ...props }: ComponentPropsWithoutRef<"input">) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input {...props} type={visible ? "text" : "password"} className={`input pr-10 ${className}`} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        title={visible ? "Hide password" : "Show password"}
        tabIndex={-1}
        className="absolute inset-y-0 right-0 flex items-center px-3 text-muted hover:text-text"
      >
        {visible ? <EyeOff aria-hidden size={16} /> : <Eye aria-hidden size={16} />}
      </button>
    </div>
  );
}
