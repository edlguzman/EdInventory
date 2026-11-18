import { z } from "zod";
import type { AuthErrorKey } from "@/lib/auth-errors";

// Error messages are dictionary keys (AuthErrorKey), translated in the form.
const msg = (key: AuthErrorKey) => ({ error: key });

const email = z.string().trim().min(1, msg("required")).pipe(z.email(msg("invalidEmail")));

// bcrypt (used by Supabase Auth) ignores everything past 72 bytes.
const newPassword = z.string().min(8, msg("passwordTooShort")).max(72, msg("passwordTooLong"));

export const loginSchema = z.object({
  email,
  password: z.string().min(1, msg("required")),
});

export const signupSchema = z
  .object({
    email,
    password: newPassword,
    confirmPassword: z.string().min(1, msg("required")),
  })
  .refine((v) => v.password === v.confirmPassword, { ...msg("passwordsMismatch"), path: ["confirmPassword"] });

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z
  .object({
    password: newPassword,
    confirmPassword: z.string().min(1, msg("required")),
  })
  .refine((v) => v.password === v.confirmPassword, { ...msg("passwordsMismatch"), path: ["confirmPassword"] });

export type LoginInput = z.input<typeof loginSchema>;
export type SignupInput = z.input<typeof signupSchema>;
export type ForgotPasswordInput = z.input<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.input<typeof resetPasswordSchema>;
