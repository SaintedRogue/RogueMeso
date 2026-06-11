"use client";

import { useId, useState } from "react";
import { HelpCircle, PlayCircle } from "lucide-react";
import { MgDot, StatusPill } from "@/components/ui";
import { parseInstructions } from "@/lib/exerciseNotes";

type Props = {
  name: string;
  muscleGroupName: string;
  color: string;
  exerciseType: string | null;
  rirLabel: string;
  status: string;
  notes: string | null;
  youtubeId: string | null;
};

/**
 * The workout-screen exercise header. Renders the name/muscle row plus, when there's
 * something to show (a written description and/or a demo video), a `?` toggle that
 * expands an inline panel directly below — no overlay, accordion-style. The `?` is
 * suppressed entirely when there's nothing to show, so it never opens an empty panel.
 */
export function ExerciseInfo({ name, muscleGroupName, color, exerciseType, rirLabel, status, notes, youtubeId }: Props) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const steps = parseInstructions(notes);
  const hasInfo = steps.length > 0 || !!youtubeId;

  return (
    <>
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <MgDot color={color} />
          <div className="min-w-0">
            <div className="truncate font-semibold leading-tight">{name}</div>
            <div className="text-xs text-muted" style={{ color }}>
              {muscleGroupName}
              {exerciseType ? ` · ${exerciseType}` : ""}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {hasInfo && (
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              aria-controls={panelId}
              aria-label={open ? `Hide details for ${name}` : `Show details for ${name}`}
              className={`inline-flex h-11 w-11 items-center justify-center rounded-full transition-colors sm:h-8 sm:w-8 ${
                open ? "text-accent" : "text-muted hover:text-text"
              }`}
            >
              <HelpCircle size={18} aria-hidden />
            </button>
          )}
          {/* On mobile the per-set RIR column is hidden, so surface the target here */}
          <span className="num whitespace-nowrap text-xs text-muted sm:hidden">{rirLabel}</span>
          <StatusPill status={status} />
        </div>
      </div>

      {hasInfo && open && (
        <div id={panelId} className="border-b border-line bg-panel/40 px-4 py-3 text-sm">
          {steps.length === 0 ? (
            <p className="text-muted">No written description yet{youtubeId ? " — watch the demo below." : "."}</p>
          ) : steps.length === 1 ? (
            <p className="leading-relaxed text-muted">{steps[0]}</p>
          ) : (
            <ol className="list-decimal space-y-1 pl-5 leading-relaxed text-muted">
              {steps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          )}
          {youtubeId && (
            <a
              href={`https://www.youtube.com/watch?v=${youtubeId}`}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-1.5 text-accent hover:underline"
            >
              <PlayCircle size={15} aria-hidden /> Watch demo
            </a>
          )}
        </div>
      )}
    </>
  );
}
