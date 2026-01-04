import Stripe from "stripe"

// Lazy initialization - client created on first use, not at module load
// This prevents build-time errors when STRIPE_SECRET_KEY isn't available
let stripeInstance: Stripe | null = null

export function getStripe(): Stripe {
  if (!stripeInstance) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error("STRIPE_SECRET_KEY is not configured")
    }
    stripeInstance = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2025-12-15.clover",
      typescript: true,
    })
  }
  return stripeInstance
}

// For backward compatibility - use getStripe() in new code
// @deprecated Use getStripe() instead
export const stripe = {
  get customers() { return getStripe().customers },
  get subscriptions() { return getStripe().subscriptions },
  get checkout() { return getStripe().checkout },
  get billingPortal() { return getStripe().billingPortal },
  get prices() { return getStripe().prices },
  get products() { return getStripe().products },
  get invoices() { return getStripe().invoices },
  get paymentIntents() { return getStripe().paymentIntents },
  get balance() { return getStripe().balance },
  get webhooks() { return getStripe().webhooks },
}
