import { describe, it, expect, beforeAll } from "vitest";
import { signSession, verifySession } from "@/lib/session";

// A fixed secret for the suite (getSecret() requires >= 32 chars).
const SECRET = "test-secret-test-secret-test-secret-1234";

beforeAll(() => {
  process.env.AUTH_SECRET = SECRET;
});

describe("session token", () => {
  it("round-trips uid + ver", async () => {
    const token = await signSession(42, 7);
    const session = await verifySession(token);
    expect(session?.uid).toBe(42);
    expect(session?.ver).toBe(7);
    expect(typeof session?.exp).toBe("number");
  });

  it("rejects a tampered signature", async () => {
    const token = await signSession(1, 0);
    const [payload] = token.split(".");
    const forged = `${payload}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`;
    expect(await verifySession(forged)).toBeNull();
  });

  it("rejects an expired token", async () => {
    // days = -1 → exp is in the past.
    const token = await signSession(1, 0, -1);
    expect(await verifySession(token)).toBeNull();
  });

  it("rejects undefined / malformed tokens", async () => {
    expect(await verifySession(undefined)).toBeNull();
    expect(await verifySession("not-a-token")).toBeNull();
  });

  it("rejects a legacy token that lacks `ver` (one-time logout on upgrade)", async () => {
    // Re-create the v1 payload shape {uid, exp} with no `ver`, signed with the same secret.
    const enc = new TextEncoder();
    const b64url = (bytes: Uint8Array) => {
      let s = "";
      for (const b of bytes) s += String.fromCharCode(b);
      return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    };
    const payload = b64url(enc.encode(JSON.stringify({ uid: 1, exp: Date.now() + 864e5 })));
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(SECRET) as unknown as BufferSource,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload) as unknown as BufferSource);
    const token = `${payload}.${b64url(new Uint8Array(sig))}`;
    expect(await verifySession(token)).toBeNull();
  });
});
