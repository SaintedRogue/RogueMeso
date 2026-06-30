"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { ActionResult } from "@/lib/actionResult";
import { toast } from "@/components/Toaster";

function Spinner() {
  return (
    <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
      <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Submit button that disables itself and shows a spinner while its form is
 * submitting. Reads useFormStatus, so it must be rendered inside a <form>.
 */
export function SubmitButton({
  children,
  className = "btn-primary px-4 py-2 text-sm",
}: {
  children: ReactNode;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`${className} inline-flex items-center justify-center gap-2 disabled:opacity-60`}
    >
      {pending && <Spinner />}
      {children}
    </button>
  );
}

/**
 * Hidden field that submits the client's LOCAL time-of-day (minutes since local midnight) so the
 * server can record when a weigh-in actually happened without needing the user's timezone. Set on
 * mount and refreshed on the form's submit event, so it reflects the true moment of submission.
 */
export function LocalTimeField({ name = "localMinutes" }: { name?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const set = () => {
      const now = new Date();
      if (ref.current) ref.current.value = String(now.getHours() * 60 + now.getMinutes());
    };
    set();
    const form = ref.current?.form;
    form?.addEventListener("submit", set);
    return () => form?.removeEventListener("submit", set);
  }, []);
  return <input ref={ref} type="hidden" name={name} defaultValue="" />;
}

type ToastFormProps = {
  /** A Server Action with the useActionState signature, returning an ActionResult. */
  action: (state: ActionResult, formData: FormData) => Promise<ActionResult>;
  children: ReactNode;
  submitLabel: string;
  className?: string;
  submitClassName?: string;
};

/**
 * A <form> bound to a Server Action that returns an ActionResult. The result is
 * surfaced as a toast; the submit button shows a pending state. Form fields are
 * passed as children (server-rendered, uncontrolled) and the submit button is
 * appended after them.
 */
export function ToastForm({ action, children, submitLabel, className, submitClassName }: ToastFormProps) {
  const [state, formAction] = useActionState(action, null);

  useEffect(() => {
    if (state) toast(state.message ?? (state.ok ? "Saved" : "Something went wrong"), state.ok ? "success" : "error");
  }, [state]);

  return (
    <form action={formAction} className={className}>
      {children}
      <SubmitButton className={submitClassName}>{submitLabel}</SubmitButton>
    </form>
  );
}
