// Per-user beacon tokens: the credential the Zepp mini-app presents to
// /api/wearables/zepp (spec §4). The plaintext is shown exactly once at generation;
// only its sha256 lands in User.zeppTokenHash, so a DB leak never leaks the token.

import { createHash, randomBytes } from "node:crypto";

/** Mint a fresh token: recognizable prefix + 192 bits of entropy. */
export function generateBeaconToken(): string {
  return `rgm_${randomBytes(24).toString("hex")}`;
}

/** The stored/compared form. Deterministic sha256 hex. */
export function hashBeaconToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
