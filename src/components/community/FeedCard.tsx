import Link from "next/link";
import { Dumbbell, Trophy, Flag, type LucideIcon } from "lucide-react";
import { ReactionBar } from "@/components/community/ReactionBar";
import type { FeedItem } from "@/lib/features/community";
import { fmtWeight, timeAgo } from "@/lib/format";

const ICON: Record<FeedItem["type"], { icon: LucideIcon; color: string }> = {
  workoutComplete: { icon: Dumbbell, color: "var(--color-info)" },
  prHit: { icon: Trophy, color: "var(--color-accent)" },
  mesoComplete: { icon: Flag, color: "var(--color-good)" },
};

function headline(item: FeedItem): { verb: string; detail: string | null } {
  switch (item.type) {
    case "workoutComplete":
      return {
        verb: "finished a workout",
        detail: [item.mesoName, item.setsCount != null ? `${item.setsCount} sets` : null]
          .filter(Boolean)
          .join(" · ") || null,
      };
    case "prHit": {
      const unit = item.unit ?? "lb";
      const lift =
        item.prWeight != null && item.prReps != null
          ? `${fmtWeight(item.prWeight, unit)} × ${item.prReps}`
          : null;
      const est = item.prOneRm != null ? `~${fmtWeight(item.prOneRm, unit)} 1RM` : null;
      return {
        verb: "hit a new PR",
        detail: [item.exerciseName, lift, est].filter(Boolean).join(" · ") || null,
      };
    }
    case "mesoComplete":
      return {
        verb: "completed a mesocycle",
        detail: [item.mesoName, item.weeksCount != null ? `${item.weeksCount} weeks` : null]
          .filter(Boolean)
          .join(" · ") || null,
      };
  }
}

export function FeedCard({ item, canReact }: { item: FeedItem; canReact: boolean }) {
  const { icon: Icon, color } = ICON[item.type];
  const { verb, detail } = headline(item);
  return (
    <div className="card p-4">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-panel-2"
          style={{ color }}
        >
          <Icon size={18} strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm leading-snug">
            <span className="font-semibold">{item.actor}</span> <span className="text-muted">{verb}</span>
          </p>
          {detail && (
            <p className="mt-0.5 text-sm text-muted">
              {item.mesoKey && item.type !== "prHit" ? (
                <Link href={`/mesocycles/${item.mesoKey}`} className="hover:text-text hover:underline">
                  {detail}
                </Link>
              ) : (
                detail
              )}
            </p>
          )}
          <p className="mt-1 text-xs text-muted/70">{timeAgo(item.occurredAt)}</p>
          <ReactionBar activityId={item.id} reactions={item.reactions} canReact={canReact} />
        </div>
      </div>
    </div>
  );
}
