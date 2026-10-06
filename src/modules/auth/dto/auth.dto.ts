import { z } from "zod";

export const registerOrgSchema = z.object({
  organizationName: z.string().min(2).max(100),
  firstName: z.string().min(1).max(60),
  lastName: z.string().min(1).max(60),
  email: z.string().email().toLowerCase(),
  password: z
    .string()
    .min(10, "Password must be at least 10 characters")
    .regex(/[A-Z]/, "Must contain an uppercase letter")
    .regex(/[a-z]/, "Must contain a lowercase letter")
    .regex(/[0-9]/, "Must contain a digit"),
});

export const loginSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(1, "Password is required"),
});

export type RegisterOrgInput = z.infer<typeof registerOrgSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
