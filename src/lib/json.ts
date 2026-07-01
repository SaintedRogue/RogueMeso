/**
 * Parse a JSON string[] column into an array, tolerating null / malformed data (→ []). The single
 * place this lives; safe to import from client or server (no dependencies). Callers that store a
 * narrower element type pass it as `T` — parsing performs no per-element validation.
 */
export function parseJsonArray<T = string>(json: string | null | undefined): T[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? (v as T[]) : [];
  } catch {
    return [];
  }
}
