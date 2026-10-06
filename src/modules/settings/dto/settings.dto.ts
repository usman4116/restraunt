import { z } from "zod";
import { RESOURCES, ACTIONS } from "@/lib/rbac";

const optionalString = (max: number) => z.string().max(max).optional().or(z.literal(""));

/** ISO 4217 currency codes are exactly three capital letters. */
const currency = z
  .string()
  .regex(/^[A-Z]{3}$/, "Use a 3-letter currency code, e.g. USD");

export const organizationSchema = z.object({
  name: z.string().min(1, "Organization name is required").max(120),
  legalName: optionalString(160),
  email: z.string().email("Enter a valid email").max(160),
  phone: optionalString(30),
  currency,
  timezone: z.string().min(1, "Timezone is required").max(60),
  logoUrl: z.string().url("Enter a valid URL").max(500).optional().or(z.literal("")),
});

export const branchSchema = z.object({
  name: z.string().min(1, "Branch name is required").max(120),
  code: z
    .string()
    .min(1, "Branch code is required")
    .max(10)
    .regex(/^[0-9A-Za-z-]+$/, "Use letters, digits or dashes"),
  address: optionalString(200),
  city: optionalString(80),
  country: optionalString(80),
  phone: optionalString(30),
  email: z.string().email("Enter a valid email").max(160).optional().or(z.literal("")),
});

// SUPER_ADMIN is platform-scoped and CUSTOMER belongs to the portal; neither is
// assignable from an organization's settings screen.
export const ASSIGNABLE_ROLES = [
  "ORG_OWNER",
  "RESTAURANT_MANAGER",
  "BRANCH_MANAGER",
  "CASHIER",
  "WAITER",
  "KITCHEN_MANAGER",
  "CHEF",
  "KITCHEN_STAFF",
  "INVENTORY_MANAGER",
  "PURCHASING_OFFICER",
  "HR_MANAGER",
  "ACCOUNTANT",
  "DELIVERY_RIDER",
  "AUDITOR",
] as const;

const userBase = z.object({
  firstName: z.string().min(1, "First name is required").max(80),
  lastName: z.string().min(1, "Last name is required").max(80),
  email: z.string().email("Enter a valid email").max(160),
  phone: optionalString(30),
  systemRole: z.enum(ASSIGNABLE_ROLES),
  branchIds: z.array(z.string().uuid()).default([]),
});

export const createUserSchema = userBase.extend({
  password: z.string().min(8, "At least 8 characters").max(72),
});

// Password is optional on edit; leaving it blank keeps the current one.
export const updateUserSchema = userBase.extend({
  password: z
    .string()
    .min(8, "At least 8 characters")
    .max(72)
    .optional()
    .or(z.literal("")),
});

const permissionPattern = new RegExp(
  `^(${RESOURCES.join("|")}):(${[...ACTIONS, "\\*"].join("|")})$`,
);

export const roleSchema = z.object({
  name: z.string().min(1, "Role name is required").max(60),
  description: optionalString(200),
  permissions: z
    .array(z.string().regex(permissionPattern, "Unknown permission"))
    .min(1, "Grant at least one permission"),
});

export const auditQuerySchema = z.object({
  entityType: optionalString(60),
  action: optionalString(60),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export type OrganizationInput = z.output<typeof organizationSchema>;
export type BranchInput = z.output<typeof branchSchema>;
export type CreateUserInput = z.output<typeof createUserSchema>;
export type UpdateUserInput = z.output<typeof updateUserSchema>;
export type RoleInput = z.output<typeof roleSchema>;
export type AuditQuery = z.output<typeof auditQuerySchema>;
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];
