/**
 * FlowPilot Authentication Validation Schemas
 * Phase 10C-B3: Authentication Backend Routes
 *
 * Implements strict input validation and normalization:
 * - RFC 5322 compliant email normalization (lowercased & trimmed)
 * - Password complexity requirements (min 10 chars, uppercase, lowercase, digit, symbol)
 * - Anti-tampering token constraints
 */

import { z } from 'zod';

/**
 * Normalizes email address to trimmed, lowercase representation.
 */
export function normalizeEmail(email: string): string {
  if (!email || typeof email !== 'string') return '';
  return email.trim().toLowerCase();
}

/**
 * Common password complexity schema.
 * Enforces: min 10 chars, max 128 chars, at least 1 uppercase, 1 lowercase, 1 digit, 1 special character.
 */
export const passwordSchema = z
  .string()
  .min(10, 'Password must be at least 10 characters long')
  .max(128, 'Password cannot exceed 128 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

/**
 * User Registration Schema
 */
export const registerSchema = z.object({
  email: z
    .string()
    .trim()
    .min(3, 'Email is required')
    .max(255, 'Email cannot exceed 255 characters')
    .email('Invalid email address format')
    .transform(normalizeEmail),
  name: z
    .string()
    .trim()
    .min(2, 'Name must be at least 2 characters long')
    .max(100, 'Name cannot exceed 100 characters'),
  password: passwordSchema,
});

export type RegisterInput = z.infer<typeof registerSchema>;

/**
 * User Login Schema
 */
export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Email is required')
    .max(255, 'Email cannot exceed 255 characters')
    .transform(normalizeEmail),
  password: z
    .string()
    .min(1, 'Password is required')
    .max(128, 'Password cannot exceed 128 characters'),
});

export type LoginInput = z.infer<typeof loginSchema>;

/**
 * Email Verification Token Schema
 */
export const verifyEmailSchema = z.object({
  token: z
    .string()
    .trim()
    .min(32, 'Verification token must be at least 32 characters')
    .max(128, 'Verification token cannot exceed 128 characters'),
});

export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

/**
 * Resend Verification Email Schema
 */
export const resendVerificationSchema = z.object({
  email: z
    .string()
    .trim()
    .email('Invalid email address format')
    .max(255, 'Email cannot exceed 255 characters')
    .transform(normalizeEmail)
    .optional(),
});

export type ResendVerificationInput = z.infer<typeof resendVerificationSchema>;

/**
 * Forgot Password Request Schema
 */
export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Email is required')
    .max(255, 'Email cannot exceed 255 characters')
    .email('Invalid email address format')
    .transform(normalizeEmail),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

/**
 * Reset Password Completion Schema
 */
export const resetPasswordSchema = z.object({
  token: z
    .string()
    .trim()
    .min(32, 'Reset token must be at least 32 characters')
    .max(128, 'Reset token cannot exceed 128 characters'),
  newPassword: passwordSchema,
});

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
