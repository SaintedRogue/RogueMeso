import { UsersRound } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createMesocycleAction } from "@/lib/mesoActions";
import {
  getFeed,
  getLeaderboard,
  getSharedTemplates,
  getCommunityMemberCount,
} from "@/lib/features/community";
import { PageHeader, EmptyState } from "@/components/ui";
import { SubmitButton } from "@/components/forms";
import { ParticipationToggle } from "@/components/community/ParticipationToggle";
import { FeedCard } from "@/components/community/FeedCard";
import { Leaderboard } from "@/components/community/Leaderboard";

export default async function CommunityPage() {
  const me = await requireUser();
  const memberCount = await getCommunityMemberCount();

  // Opt-in gate: the community is symmetric — you join to see and be seen.
  if (!me.communityOptIn) {
    return (
      <>
        <PageHeader title="Community" subtitle="Train together with everyone on this instance" />
        <div className="card mx-auto max-w-md px-6 py-12 text-center">
          <span className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-panel-2 text-accent">
            <UsersRound aria-hidden size={22} />
          </span>
          <p className="text-lg font-semibold">Join the community</p>
          <p className="mx-auto mt-1 mb-5 max-w-sm text-sm text-muted">
            Share your custom templates, cheer each other&apos;s workouts and PRs, and see who&apos;s
            putting in the work this week. You&apos;re only visible after you join — and you can leave
            anytime.
          </p>
          <div className="flex justify-center">
            <ParticipationToggle optedIn={false} />
          </div>
        </div>
      </>
    );
  }

  const [feed, board, shared] = await Promise.all([
    getFeed(me.id),
    getLeaderboard(),
    getSharedTemplates(me.id),
  ]);

  return (
    <>
      <PageHeader
        title="Community"
        subtitle={`${memberCount} ${memberCount === 1 ? "member" : "members"} training together`}
      >
        <ParticipationToggle optedIn={true} />
      </PageHeader>

      <div className="space-y-8">
        {/* This week's leaderboard */}
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">This week</h2>
          <div className="card px-4 py-2">
            <Leaderboard rows={board} meId={me.id} />
          </div>
        </section>

        {/* Activity feed */}
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Activity</h2>
          {feed.length === 0 ? (
            <EmptyState
              icon={UsersRound}
              title="No activity yet"
              hint="Finish a workout or hit a PR and it'll show up here for everyone to cheer."
            />
          ) : (
            <div className="space-y-3">
              {feed.map((item) => (
                <FeedCard key={item.id} item={item} canReact />
              ))}
            </div>
          )}
        </section>

        {/* Templates shared by other members */}
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Shared templates</h2>
          {shared.length === 0 ? (
            <p className="text-sm text-muted">
              No shared templates yet. Share one of your own from the Templates page.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {shared.map((t) => (
                <div key={t.key} className="card flex flex-col gap-3 p-4">
                  <div>
                    <div className="font-semibold leading-tight">{t.name}</div>
                    <div className="mt-1 text-xs text-muted">
                      {t.emphasis} · {t.sex}
                      {t.frequency ? ` · ${t.frequency}×/wk` : ""} · <span className="num">{t.days}</span> days
                    </div>
                    <div className="mt-1 text-xs text-muted/80">by {t.author}</div>
                  </div>
                  <form action={createMesocycleAction} className="mt-auto">
                    <input type="hidden" name="templateKey" value={t.key} />
                    <input type="hidden" name="weeks" value="5" />
                    <input type="hidden" name="unit" value={me.unit} />
                    <SubmitButton className="btn-primary w-full px-3 py-2 text-xs">
                      Use this template
                    </SubmitButton>
                  </form>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
