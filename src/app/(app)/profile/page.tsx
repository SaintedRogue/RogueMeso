import { ChevronRight, BellRing, LayoutTemplate, Gauge, UsersRound, HeartPulse, Download } from "lucide-react";
import { logout, changeMyPassword } from "@/lib/authActions";
import { setDefaultUnit } from "@/lib/settingsActions";
import { requireUser } from "@/lib/auth";
import { PageHeader, CardLink } from "@/components/ui";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ParticipationToggle } from "@/components/community/ParticipationToggle";
import { PhysicalTherapyLensToggle } from "@/components/PhysicalTherapyLensToggle";
import { ToastForm } from "@/components/forms";
import { PasswordInput } from "@/components/PasswordInput";
import { setBiometrics } from "@/lib/bodyTuningActions";
import { cmToFtIn } from "@/lib/format";

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ pw?: string }>;
}) {
  const me = await requireUser();
  const { pw } = await searchParams;
  const imperial = me.unit === "lb";
  const h = me.heightCm != null ? cmToFtIn(me.heightCm) : null;
  return (
    <>
      <PageHeader title="Profile & Settings" subtitle={me.role === "admin" ? "Admin · self-hosted" : "Self-hosted"} />

      <div className="max-w-lg space-y-4">
        <div className="card p-6">
          <div className="text-sm font-medium">{me.name ?? me.email}</div>
          <div className="text-xs text-muted">{me.email}</div>
        </div>

        <div className="card flex items-center justify-between gap-4 p-6">
          <div>
            <div className="text-sm font-medium">Appearance</div>
            <div className="text-xs text-muted">Light or dark. Follows your system by default.</div>
          </div>
          <ThemeToggle />
        </div>

        <ToastForm
          action={setDefaultUnit}
          submitLabel="Save"
          className="card flex flex-col gap-4 p-6 sm:flex-row sm:items-end sm:justify-between"
          submitClassName="btn-primary px-4 py-2 text-sm"
        >
          <div className="flex-1">
            <label className="mb-1 block text-sm font-medium text-muted">Default units</label>
            <select name="unit" defaultValue={me.unit} className="input">
              <option value="lb">lb / ft·in</option>
              <option value="kg">kg / cm</option>
            </select>
            <p className="mt-2 text-xs text-muted">Pre-selected for new mesocycles, and sets how height is entered below.</p>
          </div>
        </ToastForm>

        <ToastForm
          action={setBiometrics}
          submitLabel="Save profile"
          className="card flex flex-col gap-4 p-6"
          submitClassName="btn-primary self-start px-4 py-2 text-sm"
        >
          <label className="block text-sm font-medium text-muted">Body Tuning profile</label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor={imperial ? "heightFt" : "heightCm"} className="mb-1 block text-xs text-muted">
                Height {imperial ? "(ft · in)" : "(cm)"}
              </label>
              {imperial ? (
                <div className="flex gap-2">
                  <input
                    id="heightFt"
                    name="heightFt"
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    defaultValue={h?.ft ?? ""}
                    placeholder="ft"
                    aria-label="Height (feet)"
                    className="input"
                  />
                  <input
                    name="heightIn"
                    type="number"
                    min="0"
                    max="11"
                    step="1"
                    inputMode="numeric"
                    defaultValue={h?.in ?? ""}
                    placeholder="in"
                    aria-label="Height (inches)"
                    className="input"
                  />
                </div>
              ) : (
                <input
                  id="heightCm"
                  name="heightCm"
                  type="number"
                  step="0.1"
                  min="0"
                  defaultValue={me.heightCm ?? ""}
                  className="input"
                />
              )}
            </div>
            <div>
              <label htmlFor="birthDate" className="mb-1 block text-xs text-muted">Birth date</label>
              <input
                id="birthDate"
                name="birthDate"
                type="date"
                defaultValue={me.birthDate ? me.birthDate.toISOString().slice(0, 10) : ""}
                className="input"
              />
            </div>
            <div>
              <label htmlFor="bodySex" className="mb-1 block text-xs text-muted">Sex</label>
              <select id="bodySex" name="bodySex" defaultValue={me.bodySex ?? ""} className="input">
                <option value="">—</option>
                <option value="M">Male</option>
                <option value="F">Female</option>
              </select>
            </div>
            <div>
              <label htmlFor="activityLevel" className="mb-1 block text-xs text-muted">Activity (non-training)</label>
              <select id="activityLevel" name="activityLevel" defaultValue={me.activityLevel ?? "sedentary"} className="input">
                <option value="sedentary">Sedentary</option>
                <option value="light">Light</option>
                <option value="moderate">Moderate</option>
              </select>
            </div>
          </div>
          <p className="text-xs text-muted">Used to estimate your calorie &amp; macro targets in Body Tuning.</p>
        </ToastForm>

        <div className="card flex items-center justify-between gap-4 p-6">
          <div>
            <div className="text-sm font-medium">Community</div>
            <div className="text-xs text-muted">
              {me.communityOptIn
                ? "You're in — sharing activity and on the leaderboard."
                : "Off — share templates and progress with other members of this instance."}
            </div>
          </div>
          <ParticipationToggle optedIn={me.communityOptIn} />
        </div>

        <div className="card flex items-center justify-between gap-4 p-6">
          <div>
            <div className="text-sm font-medium">Physical Therapy Lens (beta)</div>
            <div className="text-xs text-muted">
              Adds load-management and movement-quality tracking. Informational only — not medical advice.
            </div>
          </div>
          <PhysicalTherapyLensToggle enabled={me.physicalTherapyLens} />
        </div>

        {/* Templates, Body Tuning & Community live in the desktop sidebar; on mobile they're
            not in the 5-tab bottom bar, so surface them here as link cards (mobile only). */}
        <div className="space-y-4 sm:hidden">
          <CardLink href="/community">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <UsersRound aria-hidden size={18} className="shrink-0 text-accent" />
                <div>
                  <div className="text-sm font-medium">Community</div>
                  <div className="text-xs text-muted">Feed, leaderboard &amp; shared templates.</div>
                </div>
              </div>
              <ChevronRight aria-hidden size={18} className="shrink-0 text-muted" />
            </div>
          </CardLink>

          <CardLink href="/templates">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <LayoutTemplate aria-hidden size={18} className="shrink-0 text-accent" />
                <div>
                  <div className="text-sm font-medium">Templates</div>
                  <div className="text-xs text-muted">Browse the program template catalog.</div>
                </div>
              </div>
              <ChevronRight aria-hidden size={18} className="shrink-0 text-muted" />
            </div>
          </CardLink>

          <CardLink href="/body-tuning">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Gauge aria-hidden size={18} className="shrink-0 text-accent" />
                <div>
                  <div className="text-sm font-medium">Body Tuning</div>
                  <div className="text-xs text-muted">Log weigh-ins and set calorie &amp; macro targets.</div>
                </div>
              </div>
              <ChevronRight aria-hidden size={18} className="shrink-0 text-muted" />
            </div>
          </CardLink>

          <CardLink href="/recovery">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <HeartPulse aria-hidden size={18} className="shrink-0 text-accent" />
                <div>
                  <div className="text-sm font-medium">Recovery</div>
                  <div className="text-xs text-muted">Readiness check-ins &amp; active-recovery routines.</div>
                </div>
              </div>
              <ChevronRight aria-hidden size={18} className="shrink-0 text-muted" />
            </div>
          </CardLink>
        </div>

        <CardLink href="/adhd-mode">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <BellRing aria-hidden size={18} className="shrink-0 text-accent" />
              <div>
                <div className="text-sm font-medium">ADHD Mode</div>
                <div className="text-xs text-muted">Push reminders for workouts, meals, hydration &amp; more.</div>
              </div>
            </div>
            <ChevronRight aria-hidden size={18} className="shrink-0 text-muted" />
          </div>
        </CardLink>

        {me.role === "admin" && (
          <CardLink href="/admin/users">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium">User management</div>
                <div className="text-xs text-muted">Add or remove household members.</div>
              </div>
              <ChevronRight aria-hidden size={18} className="shrink-0 text-muted" />
            </div>
          </CardLink>
        )}

        <form action="/api/export" method="get" className="card flex flex-col gap-4 p-6">
          <div className="flex items-start gap-3">
            <Download aria-hidden size={18} className="mt-0.5 shrink-0 text-accent" />
            <div>
              <div className="text-sm font-medium">Export data</div>
              <div className="text-xs text-muted">
                Download your data for analysis by an AI assistant. Pick what to include, then choose a format:
                <span className="text-text"> JSON</span> is lossless for computation, <span className="text-text">Markdown</span> is a readable summary.
              </div>
            </div>
          </div>

          <fieldset className="flex flex-wrap gap-x-5 gap-y-2">
            <legend className="mb-1 text-xs font-medium text-muted">Include</legend>
            {[
              { value: "training", label: "Training" },
              { value: "body", label: "Body tuning" },
              { value: "recovery", label: "Recovery" },
            ].map((d) => (
              <label key={d.value} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="domain" value={d.value} defaultChecked className="size-4 accent-[var(--color-accent)]" />
                {d.label}
              </label>
            ))}
          </fieldset>

          <div>
            <label htmlFor="exportFrom" className="mb-1 block text-xs font-medium text-muted">From (optional)</label>
            <input id="exportFrom" name="from" type="date" className="input sm:w-48" />
            <p className="mt-1 text-xs text-muted">Leave blank for all time. Limits weigh-ins, readiness, and logged sessions to on/after this date.</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="submit" name="format" value="json" className="btn-primary px-4 py-2 text-sm">
              Download JSON
            </button>
            <button
              type="submit"
              name="format"
              value="md"
              className="min-h-11 rounded-lg border border-line px-4 py-2 text-sm text-muted hover:text-text sm:min-h-0"
            >
              Download Markdown
            </button>
          </div>
        </form>

        <form action={changeMyPassword} className="card flex flex-col gap-4 p-6">
          <label className="block text-sm font-medium text-muted">Change password</label>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex flex-1 flex-col gap-3">
              <PasswordInput
                name="currentPassword"
                placeholder="Current password"
                autoComplete="current-password"
              />
              <PasswordInput
                name="password"
                placeholder="New password (min 8)"
                autoComplete="new-password"
              />
            </div>
            <button type="submit" className="btn-primary px-4 py-2 text-sm">Update</button>
          </div>
          {pw === "ok" && <p className="text-xs text-good">Password updated.</p>}
          {pw === "bad" && <p className="text-xs text-bad">Current password is incorrect.</p>}
          {pw === "weak" && <p className="text-xs text-bad">New password must be 8–72 characters.</p>}
        </form>

        <div className="card flex items-center justify-between p-6">
          <div>
            <div className="text-sm font-medium">Session</div>
            <div className="text-xs text-muted">Signed in to this self-hosted instance.</div>
          </div>
          <form action={logout}>
            <button type="submit" className="min-h-11 rounded-lg border border-line px-4 py-2 text-sm text-muted hover:text-bad sm:min-h-0">
              Sign out
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
