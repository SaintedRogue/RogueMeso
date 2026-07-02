"use client";

import { useTransition } from "react";
import { toast } from "@/components/Toaster";

/**
 * Share a workout day as a branded PNG. Fetches the server-rendered share image, hands it to the
 * native share sheet when available (Messages, WhatsApp, …), and otherwise downloads it so it can
 * be shared manually. Returns a `share(onDone?)` trigger + `sharing` pending flag; `onDone` fires
 * on success/dismissal so callers (e.g. a popover) can close themselves. Extracted so the day menu
 * and the completed-session view share one implementation.
 */
export function useShareWorkout(mesoKey: string, week: number, position: number) {
  const [sharing, start] = useTransition();

  const share = (onDone?: () => void) =>
    start(async () => {
      const name = `roguemeso-week${week + 1}-day${position + 1}.png`;
      try {
        const res = await fetch(`/api/mesocycles/${mesoKey}/${week}/${position}/share-image`);
        if (!res.ok) throw new Error(`image route returned ${res.status}`);
        const blob = await res.blob();
        const file = new File([blob], name, { type: "image/png" });
        const text = `My workout — Week ${week + 1}, Day ${position + 1} 💪`;

        // Native share sheet when available in a secure context.
        if (typeof navigator !== "undefined" && navigator.canShare?.({ files: [file] })) {
          try {
            await navigator.share({ files: [file], title: "My workout", text });
            onDone?.();
            return;
          } catch (err) {
            // The user dismissing the share sheet is not an error.
            if ((err as Error)?.name === "AbortError") {
              onDone?.();
              return;
            }
            // Any other share failure → fall through to the download path.
          }
        }

        // Fallback: download the PNG so it can be shared manually from Photos/Files.
        const objUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = objUrl;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(objUrl);
        onDone?.();
        toast("Saved the image — share it from your photos.");
      } catch {
        onDone?.();
        toast("Couldn't create the workout image — try again.", "error");
      }
    });

  return { share, sharing };
}
