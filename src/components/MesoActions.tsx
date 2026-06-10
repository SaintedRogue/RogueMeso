"use client";

import { useTransition } from "react";
import { archiveMesocycle, unarchiveMesocycle, deleteMesocycle } from "@/lib/mesoActions";

export function MesoActions({ mesoKey, archived }: { mesoKey: string; archived: boolean }) {
  const [pending, start] = useTransition();

  const onDelete = () => {
    if (confirm("Delete this mesocycle and all its logged sets? This cannot be undone.")) {
      start(() => deleteMesocycle(mesoKey));
    }
  };

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => start(() => (archived ? unarchiveMesocycle(mesoKey) : archiveMesocycle(mesoKey)))}
        disabled={pending}
        className="chip chip-nav hover:border-accent/50 hover:text-text disabled:opacity-50"
      >
        {archived ? "Unarchive" : "Archive"}
      </button>
      <button
        onClick={onDelete}
        disabled={pending}
        className="chip chip-nav text-bad hover:border-bad disabled:opacity-50"
        style={{ borderColor: "color-mix(in oklab, var(--color-bad) 40%, transparent)" }}
      >
        Delete
      </button>
    </div>
  );
}
