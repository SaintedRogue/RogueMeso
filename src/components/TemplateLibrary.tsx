"use client";

// Browse-mode wrapper around the shared TemplateBrowser, used on /templates. Same faceted
// search + inline preview as mesocycle creation, but instead of a config form the preview's
// full-width footer is a "Use this template" CTA that deep-links into /mesocycles/new with
// the template preselected. Owned templates keep their share toggle as a per-card footer
// (only once the user has joined the community), mirroring the previous list page.
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { TemplateBrowser, type PickerTemplate } from "@/components/TemplateBrowser";
import { ShareTemplateToggle } from "@/components/community/ShareTemplateToggle";

export type LibraryTemplate = PickerTemplate & {
  /** Owner id (null = seeded library) — drives the share footer. */
  userId: number | null;
  sharedWithInstance: boolean;
};

export function TemplateLibrary({
  templates,
  meId,
  communityOptIn,
  defaultSex,
}: {
  templates: LibraryTemplate[];
  meId: number;
  communityOptIn: boolean;
  defaultSex: "male" | "female" | null;
}) {
  // The browser is ownership-agnostic; look ours up by key for the share footer.
  const own = new Map(templates.filter((t) => t.userId === meId).map((t) => [t.key, t]));

  const useCta = (selected: PickerTemplate) => (
    <div className="card col-span-full flex flex-wrap items-center justify-between gap-3 p-5">
      <span className="text-sm text-muted">Start a training block from this template.</span>
      <Link
        href={`/mesocycles/new?template=${encodeURIComponent(selected.key)}`}
        className="btn-primary inline-flex items-center gap-2 px-4 py-2 text-sm"
      >
        Use this template
        <ArrowRight aria-hidden size={15} />
      </Link>
    </div>
  );

  // Owner's own templates get a share switch — only after they've joined the community.
  const shareFooter = communityOptIn
    ? (t: PickerTemplate) => {
        const mine = own.get(t.key);
        if (!mine) return null;
        return (
          <>
            <span className="text-xs text-muted">Your template</span>
            <ShareTemplateToggle templateKey={mine.key} shared={mine.sharedWithInstance} />
          </>
        );
      }
    : undefined;

  return (
    <TemplateBrowser
      templates={templates}
      defaultSex={defaultSex}
      previewFooter={useCta}
      cardFooter={shareFooter}
    />
  );
}
