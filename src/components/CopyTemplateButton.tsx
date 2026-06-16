"use client";

import { useTransition } from "react";
import { Copy, Loader2 } from "lucide-react";
import { copyTemplateAction } from "@/lib/templateActions";

/**
 * Duplicate this template into an editable copy the user owns (works for built-in/library
 * templates too — copy, then customize). copyTemplateAction redirects to the new copy's
 * builder on success, so there's no local success state to manage.
 */
export function CopyTemplateButton({ templateKey }: { templateKey: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      onClick={() => start(() => copyTemplateAction(templateKey))}
      disabled={pending}
      className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-2 text-sm font-medium text-muted hover:text-text disabled:opacity-60"
    >
      {pending ? <Loader2 aria-hidden size={15} className="animate-spin" /> : <Copy aria-hidden size={15} />}
      {pending ? "Copying…" : "Copy"}
    </button>
  );
}
