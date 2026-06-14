"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Loader2, Pencil, Trash2 } from "lucide-react";
import { deleteTemplateAction } from "@/lib/templateActions";

/** Edit + Delete controls for the owner of a custom template, shown on its detail page.
 *  Rendered only when the viewer owns the template (gated server-side by the parent). */
export function TemplateOwnerActions({ templateKey }: { templateKey: string }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();

  const remove = () =>
    start(async () => {
      // deleteTemplateAction redirects to /templates on success (throws control-flow).
      await deleteTemplateAction(templateKey);
    });

  return (
    <div className="flex items-center gap-2">
      <Link
        href={`/templates/${templateKey}/edit`}
        className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-2 text-sm font-medium text-muted hover:text-text"
      >
        <Pencil aria-hidden size={15} />
        Edit
      </Link>
      {confirming ? (
        <>
          <button
            type="button"
            onClick={remove}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-md border border-bad px-3 py-2 text-sm font-semibold text-bad hover:bg-bad/10 disabled:opacity-60"
          >
            {pending ? <Loader2 aria-hidden size={15} className="animate-spin" /> : <Trash2 aria-hidden size={15} />}
            Confirm delete
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={pending}
            className="rounded-md px-2 py-2 text-sm text-muted hover:text-text disabled:opacity-60"
          >
            Cancel
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-2 text-sm font-medium text-muted hover:text-bad"
        >
          <Trash2 aria-hidden size={15} />
          Delete
        </button>
      )}
    </div>
  );
}
