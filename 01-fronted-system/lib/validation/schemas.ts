/**
 * Zod Validation Schemas
 *
 * Issue #23: Add zod validation to all server actions
 *
 * Centralized validation schemas for server actions.
 * These provide type-safe validation with detailed error messages.
 */

import { z } from "zod"

// ============================================
// Common Schemas
// ============================================

/**
 * Organization slug validation
 * Backend requires: alphanumeric with underscores only (no hyphens), 3-50 characters
 */
export const orgSlugSchema = z
  .string()
  .min(3, "Organization slug must be at least 3 characters")
  .max(50, "Organization slug must be at most 50 characters")
  .regex(
    /^[a-zA-Z0-9_]{3,50}$/,
    "Organization slug must contain only letters, numbers, and underscores"
  )

/**
 * Email validation (RFC 5322 simplified)
 */
export const emailSchema = z
  .string()
  .email("Invalid email format")
  .min(1, "Email is required")
  .max(254, "Email is too long")

/**
 * Organization name validation
 */
export const orgNameSchema = z
  .string()
  .min(2, "Organization name must be at least 2 characters")
  .max(100, "Organization name must be at most 100 characters")
  .refine(
    (name) => !/<script|<\/script|javascript:|on\w+=/i.test(name),
    "Organization name contains invalid characters"
  )

/**
 * UUID validation
 */
export const uuidSchema = z
  .string()
  .uuid("Invalid UUID format")

// ============================================
// Pipeline Schemas
// ============================================

/**
 * Pipeline ID validation
 */
export const pipelineIdSchema = z
  .string()
  .min(1, "Pipeline ID is required")
  .max(50, "Pipeline ID is too long")
  .regex(
    /^[a-zA-Z0-9_-]{1,50}$/,
    "Pipeline ID must contain only letters, numbers, underscores, and hyphens"
  )

/**
 * Pipeline run parameters
 */
export const pipelineRunParamsSchema = z.object({
  orgSlug: orgSlugSchema,
  pipelineId: pipelineIdSchema,
  params: z.record(z.unknown()).optional(),
})

/**
 * Pipeline run with date
 */
export const pipelineRunWithDateSchema = z.object({
  orgSlug: orgSlugSchema,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format").optional(),
})

// ============================================
// Integration Schemas
// ============================================

/**
 * Valid integration providers
 */
export const integrationProviderSchema = z.enum([
  "openai",
  "anthropic",
  "gemini",
  "deepseek",
  "gcp",
  "gcp_service_account",
])

/**
 * Setup integration input
 */
export const setupIntegrationSchema = z.object({
  orgSlug: orgSlugSchema,
  provider: integrationProviderSchema,
  credential: z.string().min(1, "Credential is required"),
  credentialName: z.string().max(100).optional(),
  metadata: z.record(z.unknown()).optional(),
})

// ============================================
// Member Management Schemas
// ============================================

/**
 * User role validation
 */
export const userRoleSchema = z.enum(["owner", "admin", "collaborator", "read_only"])

/**
 * Invite member input
 */
export const inviteMemberSchema = z.object({
  orgSlug: orgSlugSchema,
  email: emailSchema,
  role: userRoleSchema,
})

/**
 * Update member role input
 */
export const updateMemberRoleSchema = z.object({
  orgSlug: orgSlugSchema,
  memberId: uuidSchema,
  newRole: userRoleSchema,
})

/**
 * Remove member input
 */
export const removeMemberSchema = z.object({
  orgSlug: orgSlugSchema,
  memberId: uuidSchema,
})

// ============================================
// Organization Schemas
// ============================================

/**
 * Create organization input
 */
export const createOrganizationSchema = z.object({
  name: orgNameSchema,
  type: z.string().min(1, "Organization type is required"),
  priceId: z.string().startsWith("price_", "Invalid Stripe price ID"),
  planId: z.string().min(1, "Plan ID is required"),
  limits: z.object({
    teamMembers: z.number().int().positive(),
    providers: z.number().int().positive(),
    pipelinesPerDay: z.number().int().positive(),
  }),
  trialDays: z.number().int().nonnegative(),
})

// ============================================
// Billing/Stripe Schemas
// ============================================

/**
 * Stripe price ID validation
 */
export const stripePriceIdSchema = z
  .string()
  .startsWith("price_", "Invalid Stripe price ID")
  .min(10, "Stripe price ID is too short")

/**
 * Create checkout session input
 */
export const createCheckoutSessionSchema = z.object({
  priceId: stripePriceIdSchema,
  orgSlug: orgSlugSchema.optional(),
})

/**
 * Change subscription plan input
 */
export const changeSubscriptionPlanSchema = z.object({
  orgSlug: orgSlugSchema,
  newPriceId: stripePriceIdSchema,
})

// ============================================
// LLM Data Schemas
// ============================================

/**
 * LLM provider validation
 */
export const llmProviderSchema = z.enum([
  "openai",
  "anthropic",
  "gemini",
  "deepseek",
  "custom",
])

/**
 * Pricing type validation
 */
export const pricingTypeSchema = z.enum([
  "standard",
  "free_tier",
  "volume_discount",
  "committed_use",
  "promotional",
  "negotiated",
])

/**
 * Billing period validation
 */
export const billingPeriodSchema = z.enum([
  "weekly",
  "monthly",
  "quarterly",
  "yearly",
  "pay_as_you_go",
])

/**
 * LLM pricing create input
 */
export const createLLMPricingSchema = z.object({
  orgSlug: orgSlugSchema,
  provider: llmProviderSchema,
  pricing: z.object({
    model_id: z.string().min(1, "Model ID is required"),
    model_name: z.string().optional(),
    input_price_per_1k: z.number().nonnegative(),
    output_price_per_1k: z.number().nonnegative(),
    effective_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format"),
    notes: z.string().max(500).optional(),
    pricing_type: pricingTypeSchema.optional(),
  }),
})

/**
 * SaaS subscription create input
 */
export const createSaaSSubscriptionSchema = z.object({
  orgSlug: orgSlugSchema,
  provider: llmProviderSchema,
  subscription: z.object({
    subscription_id: z.string().min(1, "Subscription ID is required"),
    plan_name: z.string().min(1, "Plan name is required"),
    quantity: z.number().int().positive(),
    unit_price_usd: z.number().nonnegative(),
    effective_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format"),
    notes: z.string().max(500).optional(),
    billing_period: billingPeriodSchema.optional(),
  }),
})

// ============================================
// Helper Functions
// ============================================

/**
 * Validate input with a zod schema and return formatted errors
 */
export function validateInput<T>(schema: z.ZodSchema<T>, input: unknown): {
  success: boolean
  data?: T
  error?: string
} {
  try {
    const result = schema.safeParse(input)
    if (result.success) {
      return { success: true, data: result.data }
    }

    // Format zod errors into a readable message
    const errors = result.error.errors.map(e => `${e.path.join(".")}: ${e.message}`).join("; ")
    return { success: false, error: errors }
  } catch (error) {
    return { success: false, error: "Validation error" }
  }
}
