"use client";

import { useId, useState } from "react";
import { HelpCircle, PlayCircle, Repeat } from "lucide-react";
import { MgDot, StatusPill } from "@/components/ui";
import { SwapPanel } from "@/components/SwapPanel";
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
  // Swap controls — the picker is muscle-group focused and lives in an inline panel.
  dayExerciseId: number;
  currentExerciseId: number | null;
  muscleGroupId: number;
  muscleGroups: { id: number; name: string }[];
};

/**
 * The workout-screen exercise header. Renders the name/muscle row plus, when there's
 * something to show (a written description and/or a demo video), a `?` toggle that
 * expands an inline panel directly below — no overlay, accordion-style. The `?` is
 * suppressed entirely when there's nothing to show, so it never opens an empty panel.
 */
export function ExerciseInfo({
  name,
  muscleGroupName,
  color,
  exerciseType,
  rirLabel,
  status,
  notes,
  youtubeId,
  dayExerciseId,
  currentExerciseId,
  muscleGroupId,
  muscleGroups,
}: Props) {
  const [open, setOpen] = useState(false);
  const [swapOpen, setSwapOpen] = useState(false);
  const panelId = useId();
  const swapId = useId();
  const steps = parseInstructions(notes);
  const hasInfo = steps.length > 0 || !!youtubeId;

  return (
    <>
      {/* Mobile: the name gets its own full-width row so it's never clipped by the controls,
          which drop to a second row below. At sm+ it collapses back to one inline row. */}
      <div className="flex flex-col gap-1.5 border-b border-line px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
        <div className="flex min-w-0 items-center gap-2 sm:flex-1">
          <MgDot color={color} />
          <div className="min-w-0">
            <div className="truncate font-semibold leading-tight" title={name}>
              {name}
            </div>
            <div className="text-xs text-muted" style={{ color }}>
              {muscleGroupName}
              {exerciseType ? ` · ${exerciseType}` : ""}
            </div>
          </div>
        </div>
        {/* Mobile: actions left, RIR+status right (justify-between across the full row). At sm
            the subgroups sit adjacent, restoring the original inline control cluster. */}
        <div className="flex items-center justify-between gap-1.5 sm:shrink-0 sm:justify-normal">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                setSwapOpen((o) => !o);
                setOpen(false);
              }}
              aria-expanded={swapOpen}
              aria-controls={swapId}
              aria-label={swapOpen ? `Cancel swapping ${name}` : `Swap ${name} for another ${muscleGroupName} exercise`}
              className={`inline-flex h-11 w-11 items-center justify-center rounded-full transition-colors sm:h-8 sm:w-8 ${
                swapOpen ? "text-accent" : "text-muted hover:text-text"
              }`}
            >
              <Repeat size={17} aria-hidden />
            </button>
            {hasInfo && (
              <button
                type="button"
                onClick={() => {
                  setOpen((o) => !o);
                  setSwapOpen(false);
                }}
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
          </div>
          <div className="flex items-center gap-1.5">
            {/* On mobile the per-set RIR column is hidden, so surface the target here */}
            <span className="num whitespace-nowrap text-xs text-muted sm:hidden">{rirLabel}</span>
            <StatusPill status={status} />
          </div>
        </div>
      </div>

      {swapOpen && (
        <SwapPanel
          id={swapId}
          dayExerciseId={dayExerciseId}
          currentExerciseId={currentExerciseId}
          defaultMuscleGroupId={muscleGroupId}
          muscleGroups={muscleGroups}
          onDone={() => setSwapOpen(false)}
        />
      )}

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
