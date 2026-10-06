import { describe, it, expect } from "vitest";
import {
  normalizePermissions,
  allPermissions,
  isLastOwner,
} from "../service/settings.service";
import {
  organizationSchema,
  branchSchema,
  createUserSchema,
  updateUserSchema,
  roleSchema,
} from "../dto/settings.dto";
import { RESOURCES, ACTIONS } from "@/lib/rbac";

describe("normalizePermissions", () => {
  it("drops duplicates", () => {
    expect(normalizePermissions(["orders:view", "orders:view"])).toEqual(["orders:view"]);
  });

  it("drops per-action grants already implied by the wildcard", () => {
    expect(normalizePermissions(["orders:view", "orders:*", "orders:create"])).toEqual([
      "orders:*",
    ]);
  });

  it("keeps other resources untouched next to a wildcard", () => {
    expect(normalizePermissions(["orders:*", "menu:view"])).toEqual(["menu:view", "orders:*"]);
  });

  it("sorts for stable diffs", () => {
    expect(normalizePermissions(["pos:view", "kds:view"])).toEqual(["kds:view", "pos:view"]);
  });
});

describe("allPermissions", () => {
  it("covers every resource-action combination exactly once", () => {
    const all = allPermissions();
    expect(all).toHaveLength(RESOURCES.length * ACTIONS.length);
    expect(new Set(all).size).toBe(all.length);
    expect(all).toContain("orders:refund");
  });
});

describe("isLastOwner", () => {
  it("guards the only remaining owner", () => {
    expect(isLastOwner(1, { systemRole: "ORG_OWNER" })).toBe(true);
  });

  it("lets an owner go when another remains", () => {
    expect(isLastOwner(2, { systemRole: "ORG_OWNER" })).toBe(false);
  });

  it("never blocks non-owner roles", () => {
    expect(isLastOwner(1, { systemRole: "CASHIER" })).toBe(false);
  });
});

describe("organizationSchema", () => {
  const base = {
    name: "Bistro Group",
    email: "billing@bistro.example",
    currency: "USD",
    timezone: "America/New_York",
  };

  it("accepts a minimal valid profile", () => {
    expect(organizationSchema.safeParse(base).success).toBe(true);
  });

  it("rejects a lowercase currency code", () => {
    expect(organizationSchema.safeParse({ ...base, currency: "usd" }).success).toBe(false);
  });

  it("rejects a malformed email", () => {
    expect(organizationSchema.safeParse({ ...base, email: "nope" }).success).toBe(false);
  });
});

describe("branchSchema", () => {
  it("accepts name plus code", () => {
    expect(branchSchema.safeParse({ name: "Downtown", code: "B01" }).success).toBe(true);
  });

  it("rejects a code with spaces", () => {
    expect(branchSchema.safeParse({ name: "Downtown", code: "B 1" }).success).toBe(false);
  });
});

describe("user schemas", () => {
  const base = {
    firstName: "Aisha",
    lastName: "Khan",
    email: "aisha@bistro.example",
    systemRole: "CASHIER",
    branchIds: [],
  };

  it("requires a password of at least 8 characters on create", () => {
    expect(createUserSchema.safeParse({ ...base, password: "short" }).success).toBe(false);
    expect(createUserSchema.safeParse({ ...base, password: "long-enough" }).success).toBe(true);
  });

  it("lets an edit leave the password blank to keep the current one", () => {
    expect(updateUserSchema.safeParse({ ...base, password: "" }).success).toBe(true);
  });

  it("still validates a supplied password on edit", () => {
    expect(updateUserSchema.safeParse({ ...base, password: "short" }).success).toBe(false);
  });

  it("refuses the platform-scoped SUPER_ADMIN role", () => {
    expect(
      createUserSchema.safeParse({ ...base, systemRole: "SUPER_ADMIN", password: "long-enough" })
        .success,
    ).toBe(false);
  });
});

describe("roleSchema", () => {
  it("accepts known permissions including wildcards", () => {
    const parsed = roleSchema.safeParse({
      name: "Shift supervisor",
      permissions: ["orders:*", "reports:view"],
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a permission for an unknown resource", () => {
    expect(
      roleSchema.safeParse({ name: "X", permissions: ["spaceships:view"] }).success,
    ).toBe(false);
  });

  it("rejects an empty grant list", () => {
    expect(roleSchema.safeParse({ name: "X", permissions: [] }).success).toBe(false);
  });
});
