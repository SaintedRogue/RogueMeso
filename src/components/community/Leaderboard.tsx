import { Flame } from "lucide-react";
import type { LeaderboardRow } from "@/lib/features/community";

const MEDAL = ["🥇", "🥈", "🥉"];

/** This-week board (rolling 7 days). Ranked by workouts → sets → volume. Streak is a
 *  longer-horizon flourish, not part of the ranking. */
export function Leaderboard({ rows, meId }: { rows: LeaderboardRow[]; meId: number }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted">No activity yet this week — be the first to log a workout.</p>;
  }
  return (
    <ul className="divide-y divide-line/60">
      {rows.map((r, i) => (
        <li
          key={r.userId}
          className={`flex items-center gap-3 py-2.5 ${r.userId === meId ? "font-semibold" : ""}`}
        >
          <span className="num w-6 shrink-0 text-center text-sm text-muted">{MEDAL[i] ?? i + 1}</span>
          <span className="min-w-0 flex-1 truncate text-sm">
            {r.name}
            {r.userId === meId && <span className="ml-1 text-xs font-normal text-muted">(you)</span>}
          </span>
          {r.streak > 1 && (
            <span className="inline-flex items-center gap-1 text-xs text-accent" title={`${r.streak}-day streak`}>
              <Flame aria-hidden size={13} />
              <span className="num">{r.streak}</span>
            </span>
          )}
          <span className="num w-10 shrink-0 text-right text-sm" title="workouts this week">
            {r.workouts}
          </span>
          <span className="num w-12 shrink-0 text-right text-sm text-muted" title="sets this week">
            {r.sets}
          </span>
        </li>
      ))}
    </ul>
  );
}
