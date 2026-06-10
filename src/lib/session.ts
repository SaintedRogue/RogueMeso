// Signed (HMAC-SHA256) session cookie carrying the user id. Web Crypto so it works in
// both Edge (proxy) and the Node runtime. Passwords are verified separately via bcrypt.

export const SESSION_COOKIE = "openmeso_session";
export type Session = { uid: number; exp: number };

const enc = new TextEncoder();

/**
 * The signing secret, validated on use. We deliberately do NOT fall back to a
 * default: an empty/weak key would let anyone forge a session cookie for any
 * user. Fail loudly instead so a misconfigured deploy can't silently run open.
 */
function getSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "AUTH_SECRET is missing or too short — set it to a random string of at least 32 characters.",
    );
  }
  return secret;
}

/** Cast a Uint8Array to BufferSource (TS 5.7+ types TypedArrays generically over ArrayBufferLike). */
function src(u: Uint8Array): BufferSource {
  return u as unknown as BufferSource;
}

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const byte of b) s += String.fromCharCode(byte);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64url(s: string): Uint8Array {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(s + "=".repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function hmacKey(secret: string) {
  return crypto.subtle.importKey("raw", src(enc.encode(secret)), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

/** Create a signed session token for a user, valid for `days`. */
export async function signSession(uid: number, days = 30): Promise<string> {
  const payload = b64url(enc.encode(JSON.stringify({ uid, exp: Date.now() + days * 864e5 })));
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(getSecret()), src(enc.encode(payload)));
  return `${payload}.${b64url(sig)}`;
}

/** Returns the session payload if the token is well-formed, correctly signed, and unexpired. */
export async function verifySession(token: string | undefined): Promise<Session | null> {
  if (!token || !token.includes(".")) return null;
  const key = await hmacKey(getSecret());
  const [payload, sig] = token.split(".");
  try {
    const ok = await crypto.subtle.verify("HMAC", key, src(fromB64url(sig)), src(enc.encode(payload)));
    if (!ok) return null;
    const data = JSON.parse(new TextDecoder().decode(fromB64url(payload)));
    if (typeof data?.uid !== "number" || typeof data?.exp !== "number" || data.exp <= Date.now()) return null;
    return data as Session;
  } catch {
    return null;
  }
}
