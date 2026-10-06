import { describe, it, expect } from "vitest";
import { hasPermission, permissionsForRole, ROLE_PERMISSIONS } from "../rbac";

describe("hasPermission", () => {
  it("grants everything to *:*", () => {
    expect(hasPermission(["*:*"], "orders:refund")).toBe(true);
    expect(hasPermission(["*:*"], "finance:manage")).toBe(true);
  });

  it("grants resource wildcard", () => {
    expect(hasPermission(["pos:*"], "pos:create")).toBe(true);
    expect(hasPermission(["pos:*"], "orders:create")).toBe(false);
  });

  it("grants exact matches only otherwise", () => {
    expect(hasPermission(["orders:view"], "orders:view")).toBe(true);
    expect(hasPermission(["orders:view"], "orders:update")).toBe(false);
  });

  it("denies with an empty grant list", () => {
    expect(hasPermission([], "menu:view")).toBe(false);
  });
});

describe("role defaults", () => {
  it("cashier cannot refund or touch finance", () => {
    const perms = permissionsForRole("CASHIER");
    expect(hasPermission(perms, "orders:refund")).toBe(false);
    expect(hasPermission(perms, "finance:view")).toBe(false);
    expect(hasPermission(perms, "pos:create")).toBe(true);
  });

  it("auditor is read-only everywhere", () => {
    const perms = permissionsForRole("AUDITOR");
    expect(hasPermission(perms, "finance:view")).toBe(true);
    expect(hasPermission(perms, "finance:update")).toBe(false);
    expect(hasPermission(perms, "orders:void")).toBe(false);
  });

  it("kitchen staff can only work the KDS", () => {
    const perms = permissionsForRole("KITCHEN_STAFF");
    expect(hasPermission(perms, "kds:update")).toBe(true);
    expect(hasPermission(perms, "menu:update")).toBe(false);
  });

  it("every role has a defined permission set", () => {
    for (const [role, perms] of Object.entries(ROLE_PERMISSIONS)) {
      expect(Array.isArray(perms), `role ${role}`).toBe(true);
    }
  });
});
