// Single source of truth for the password policy, shared by every place that
// sets or accepts a password (self-registration is admin-only, so this is the
// whole policy surface).

export const MIN_PASSWORD = 8;
// bcrypt silently truncates input beyond 72 bytes; reject longer so a user
// never thinks the extra characters protect them.
export const MAX_PASSWORD = 72;

export function isValidPassword(pw: string): boolean {
  return pw.length >= MIN_PASSWORD && pw.length <= MAX_PASSWORD;
}
