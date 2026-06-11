"use client";

// Client side of Web Push: registers the service worker, drives PushManager subscribe/
// unsubscribe, the master on/off switch, and a test send. Browser support + the current
// device's subscription are only knowable client-side, so this owns that state; the
// server only knows the master flag (passed in) and which subscriptions exist.
import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { Bell, BellOff, BellRing, Send } from "lucide-react";
import { toast } from "@/components/Toaster";
import { subscribePush, unsubscribePush, sendTestPush } from "@/lib/pushActions";
import { setGlobalEnabled } from "@/lib/adhdModeActions";

/** Fetch the VAPID public key from the server at runtime (not a build-time inline). */
async function fetchVapidKey(): Promise<string | null> {
  try {
    const res = await fetch("/api/push/vapid-key", { credentials: "include" });
    if (!res.ok) return null;
    const json = (await res.json()) as { publicKey: string | null };
    return json.publicKey;
  } catch {
    return null;
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  // Back the array with a concrete ArrayBuffer so the type is BufferSource-compatible.
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Synthesised weight-plate "clank" — a metallic double-hit, no audio asset needed. */
function playClank() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ac = new Ctx();
    const now = ac.currentTime;
    [0, 0.075].forEach((t, i) => {
      const o1 = ac.createOscillator();
      const o2 = ac.createOscillator();
      const gain = ac.createGain();
      o1.type = "square";
      o2.type = "triangle";
      o1.frequency.value = 2400 - i * 350;
      o2.frequency.value = 3200 - i * 500;
      gain.gain.setValueAtTime(0.0001, now + t);
      gain.gain.exponentialRampToValueAtTime(0.3, now + t + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.17);
      o1.connect(gain);
      o2.connect(gain);
      gain.connect(ac.destination);
      o1.start(now + t);
      o2.start(now + t);
      o1.stop(now + t + 0.2);
      o2.stop(now + t + 0.2);
    });
    setTimeout(() => void ac.close(), 700);
  } catch {
    /* audio not available — silent */
  }
}

// Static client-only capabilities, read once via useSyncExternalStore (the codebase's
// pattern for browser reads — avoids synchronous setState-in-effect). Cached so the
// snapshot reference is stable across renders.
const SERVER_FLAGS = { supported: true, isIOS: false, standalone: true };
let cachedFlags: typeof SERVER_FLAGS | null = null;
function readClientFlags() {
  if (cachedFlags) return cachedFlags;
  cachedFlags = {
    supported: "serviceWorker" in navigator && "PushManager" in window,
    isIOS: /iPad|iPhone|iPod/.test(navigator.userAgent),
    standalone: window.matchMedia("(display-mode: standalone)").matches,
  };
  return cachedFlags;
}
const noopSubscribe = () => () => {};

export function PushEnableCard({ globalEnabled }: { globalEnabled: boolean }) {
  const { supported, isIOS, standalone } = useSyncExternalStore(noopSubscribe, readClientFlags, () => SERVER_FLAGS);
  const [subscribed, setSubscribed] = useState(false);
  const [enabled, setEnabled] = useState(globalEnabled);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!supported) return;
    let active = true;
    // setState happens only in the async callback (not synchronously in the effect body).
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        if (active) setSubscribed(!!sub);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [supported]);

  async function subscribe() {
    const vapidKey = await fetchVapidKey();
    if (!vapidKey) {
      toast("Push keys not configured on the server", "error");
      return;
    }
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
      const json = sub.toJSON();
      const res = await subscribePush({
        endpoint: sub.endpoint,
        p256dh: json.keys?.p256dh ?? "",
        auth: json.keys?.auth ?? "",
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        userAgent: navigator.userAgent,
      });
      setSubscribed(true);
      toast(res?.message ?? "Enabled", res?.ok ? "success" : "error");
    } catch {
      toast("Permission denied or subscription failed", "error");
    }
  }

  async function disable() {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await unsubscribePush(sub.endpoint);
        await sub.unsubscribe();
      }
      setSubscribed(false);
      toast("Notifications disabled on this device", "success");
    } catch {
      toast("Could not disable", "error");
    }
  }

  function toggleMaster() {
    const next = !enabled;
    setEnabled(next);
    start(async () => {
      const res = await setGlobalEnabled(next);
      toast(res?.message ?? "Saved", res?.ok ? "success" : "error");
    });
  }

  function test() {
    playClank();
    start(async () => {
      const res = await sendTestPush();
      toast(res?.message ?? "Sent", res?.ok ? "success" : "error");
    });
  }

  return (
    <div className="card space-y-4 p-6">
      {/* Master switch */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-panel-2 text-accent">
            {enabled ? <BellRing size={18} aria-hidden /> : <BellOff size={18} aria-hidden />}
          </span>
          <div>
            <div className="font-semibold">ADHD Mode {enabled ? "is on" : "is off"}</div>
            <p className="text-sm text-muted">Turns all habit reminders on or off across your account.</p>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="ADHD Mode master switch"
          onClick={toggleMaster}
          disabled={pending}
          className={`flex h-6 w-11 shrink-0 items-center rounded-full px-0.5 transition-colors disabled:opacity-60 ${
            enabled ? "bg-accent" : "bg-panel-2 ring-1 ring-inset ring-line"
          }`}
        >
          <span
            className={`h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
              enabled ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>

      {!supported && (
        <p className="rounded-lg bg-panel-2 p-3 text-sm text-muted">
          This browser doesn&apos;t support push notifications.
        </p>
      )}

      {supported && isIOS && !standalone && (
        <p className="rounded-lg bg-panel-2 p-3 text-sm text-muted">
          On iPhone, push only works after you install this app: tap the Share button, then
          <span className="font-medium text-text"> Add to Home Screen</span>, and open it from there.
        </p>
      )}

      {/* This device — per-device push registration (a separate scope from the master switch) */}
      {supported && (
        <div className="rounded-lg border border-line p-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <span className={`h-2 w-2 shrink-0 rounded-full ${subscribed ? "bg-accent" : "bg-muted"}`} aria-hidden />
            This device {subscribed ? "is set up" : "isn’t set up yet"}
          </div>
          <p className="mt-1 text-sm text-muted">
            {subscribed
              ? "This browser is registered to receive push reminders."
              : "Register this browser to receive reminders here — each device is enabled separately."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {subscribed ? (
              <>
                <button type="button" onClick={test} disabled={pending} className="btn-primary inline-flex items-center gap-2 px-4 py-2 text-sm disabled:opacity-60">
                  <Send size={15} aria-hidden /> Send test
                </button>
                <button type="button" onClick={disable} className="chip-nav inline-flex items-center gap-2">
                  <BellOff size={15} aria-hidden /> Disable on this device
                </button>
              </>
            ) : (
              <button type="button" onClick={subscribe} className="btn-primary inline-flex items-center gap-2 px-4 py-2 text-sm">
                <Bell size={15} aria-hidden /> Enable on this device
              </button>
            )}
          </div>
        </div>
      )}

      {/* Set up on this device, but the account master is off → nothing will fire until it's on. */}
      {supported && subscribed && !enabled && (
        <p className="rounded-lg bg-panel-2 p-3 text-sm text-muted">
          This device is set up, but ADHD Mode is off — turn the master switch on to start receiving reminders.
        </p>
      )}
    </div>
  );
}
