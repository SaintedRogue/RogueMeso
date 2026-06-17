import { describe, it, expect } from "vitest";
import { validatePushEndpoint } from "@/lib/pushEndpoint";

const ok = (s: string) => validatePushEndpoint(s).ok;

describe("validatePushEndpoint", () => {
  it("accepts real push-service endpoints", () => {
    expect(ok("https://fcm.googleapis.com/fcm/send/abc123")).toBe(true);
    expect(ok("https://updates.push.services.mozilla.com/wpush/v2/xyz")).toBe(true);
    expect(ok("https://web.push.apple.com/Qabc")).toBe(true);
  });

  it("rejects non-https schemes", () => {
    expect(ok("http://fcm.googleapis.com/x")).toBe(false);
    expect(ok("ftp://example.com/x")).toBe(false);
  });

  it("rejects loopback and localhost", () => {
    expect(ok("https://localhost/x")).toBe(false);
    expect(ok("https://app.localhost/x")).toBe(false);
    expect(ok("https://127.0.0.1/x")).toBe(false);
    expect(ok("https://[::1]/x")).toBe(false);
  });

  it("rejects private and link-local IPv4 (incl. cloud metadata)", () => {
    expect(ok("https://10.0.0.5/x")).toBe(false);
    expect(ok("https://192.168.1.10/x")).toBe(false);
    expect(ok("https://172.16.5.5/x")).toBe(false);
    expect(ok("https://169.254.169.254/latest/meta-data/")).toBe(false);
    expect(ok("https://0.0.0.0/x")).toBe(false);
  });

  it("rejects unique-local / link-local IPv6", () => {
    expect(ok("https://[fd00::1]/x")).toBe(false);
    expect(ok("https://[fe80::1]/x")).toBe(false);
  });

  it("rejects malformed input", () => {
    expect(ok("not a url")).toBe(false);
    expect(ok("")).toBe(false);
  });
});
