"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Watch } from "lucide-react";
import { generateZeppToken, revokeZeppToken } from "@/lib/wearablesActions";

/**
 * Profile → Wearables: pair the Zepp watch app via a per-user beacon token. The
 * plaintext appears exactly once, right after generation — copy it into the mini-app's
 * settings (Zepp app). Regenerate replaces it; revoke cuts the watch off instantly.
 */
export function WearablesPanel({ paired }: { paired: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [freshToken, setFreshToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const generate = () =>
    startTransition(async () => {
      const { token } = await generateZeppToken();
      setFreshToken(token);
      setCopied(false);
      router.refresh();
    });

  const revoke = () =>
    startTransition(async () => {
      await revokeZeppToken();
      setFreshToken(null);
      router.refresh();
    });

  const copy = async () => {
    if (!freshToken) return;
    try {
      await navigator.clipboard.writeText(freshToken);
      setCopied(true);
    } catch {
      /* clipboard unavailable — the token is selectable text */
    }
  };

  return (
    <div className="card flex flex-col gap-3 p-6">
      <div className="flex items-center gap-2">
        <Watch aria-hidden size={16} className="text-accent" />
        <div className="text-sm font-medium">Watch beacon</div>
      </div>
      <p className="text-xs text-muted">
        Pairs the RogueMeso watch app (Zepp OS) with your account. Generate a token, then paste it
        into the watch app&apos;s settings in the Zepp phone app.
      </p>

      {freshToken ? (
        <div>
          <div className="flex items-center gap-2">
            <code className="input flex-1 select-all break-all py-2 text-xs">{freshToken}</code>
            <button type="button" onClick={copy} className="chip chip-nav shrink-0" aria-label="Copy token">
              {copied ? <Check aria-hidden size={14} className="text-good" /> : <Copy aria-hidden size={14} />}
            </button>
          </div>
          <p className="mt-2 text-xs text-warn">
            Shown only once — copy it now. Generating again replaces it.
          </p>
        </div>
      ) : (
        <p className="text-xs text-muted">
          {paired ? "A token is active — the watch can sync." : "No token yet — the watch can't sync."}
        </p>
      )}

      <div className="flex gap-2">
        <button type="button" onClick={generate} disabled={pending} className="btn-primary px-4 py-2 text-sm disabled:opacity-60">
          {paired || freshToken ? "Regenerate token" : "Generate token"}
        </button>
        {(paired || freshToken) && (
          <button type="button" onClick={revoke} disabled={pending} className="chip chip-nav px-4 py-2 text-sm disabled:opacity-60">
            Revoke
          </button>
        )}
      </div>
    </div>
  );
}
