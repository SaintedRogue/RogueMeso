// Exercise.notes is a single nullable String, but the seed pipeline stores instructions
// as a JSON-stringified array of steps (see prisma/seed/seedReference.ts → asNotes), while
// hand-entered notes are plain text. This pure helper normalizes both into a list of steps
// for display: a JSON array becomes its (trimmed, non-empty) elements; anything else becomes
// a single-element list; empty/null becomes []. Kept pure + tested, like lib/roles.ts.

export function parseInstructions(notes: string | null | undefined): string[] {
  if (!notes) return [];
  const text = notes.trim();
  if (!text) return [];
  if (text.startsWith("[")) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return parsed.map((s) => String(s).trim()).filter(Boolean);
    } catch {
      // not valid JSON after all — fall through and treat as plain text
    }
  }
  return [text];
}
