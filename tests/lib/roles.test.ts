import { describe, it, expect } from "vitest";
import { ROLES, isRole, roleLabel, isAdmin, isActiveAdmin, wouldOrphanAdmins } from "@/lib/roles";

describe("isRole", () => {
  it("accepts only the known roles", () => {
    for (const r of ROLES) expect(isRole(r)).toBe(true);
    expect(isRole("amdin")).toBe(false); // typo guard
    expect(isRole("")).toBe(false);
    expect(isRole("superuser")).toBe(false);
  });
});

describe("roleLabel", () => {
  it("maps roles to human labels", () => {
    expect(roleLabel("admin")).toBe("Admin");
    expect(roleLabel("user")).toBe("Member");
  });
});

describe("isAdmin", () => {
  it("is true only for the admin role", () => {
    expect(isAdmin({ role: "admin" })).toBe(true);
    expect(isAdmin({ role: "user" })).toBe(false);
  });
});

describe("isActiveAdmin", () => {
  it("requires both the admin role and an active account", () => {
    expect(isActiveAdmin({ role: "admin", active: true })).toBe(true);
    expect(isActiveAdmin({ role: "admin", active: false })).toBe(false); // deactivated admin can't administer
    expect(isActiveAdmin({ role: "user", active: true })).toBe(false);
  });
});

describe("wouldOrphanAdmins", () => {
  it("blocks removing the last active admin", () => {
    expect(wouldOrphanAdmins({ role: "admin", active: true }, 0)).toBe(true);
  });
  it("allows it when another active admin remains", () => {
    expect(wouldOrphanAdmins({ role: "admin", active: true }, 1)).toBe(false);
  });
  it("never blocks for a non-admin or already-inactive target", () => {
    expect(wouldOrphanAdmins({ role: "user", active: true }, 0)).toBe(false);
    expect(wouldOrphanAdmins({ role: "admin", active: false }, 0)).toBe(false);
  });
});
