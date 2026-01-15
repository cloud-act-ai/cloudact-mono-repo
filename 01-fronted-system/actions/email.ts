"use server"

import { sendWelcomeEmail as sendWelcomeEmailInternal } from "@/lib/email"

/**
 * Server action to send welcome email after onboarding
 * This is required because nodemailer cannot be imported in client components
 */
export async function sendWelcomeEmailAction({
  to,
  name,
  orgName,
  dashboardLink,
}: {
  to: string
  name: string
  orgName: string
  dashboardLink: string
}): Promise<{ success: boolean }> {
  try {
    await sendWelcomeEmailInternal({
      to,
      name,
      orgName,
      dashboardLink,
    })
    return { success: true }
  } catch (error) {
    console.warn("[Email Action] Failed to send welcome email:", error)
    return { success: false }
  }
}
