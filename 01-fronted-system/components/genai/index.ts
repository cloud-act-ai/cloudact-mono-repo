/**
 * GenAI Components Index
 *
 * Reusable pricing table components for GenAI provider integration pages.
 * Supports three pricing models: PAYG, Commitment, and Infrastructure.
 */

// Base components
export { PricingTableBase, PricingTableIcons } from "./pricing-table-base"
export type { PricingColumn, PricingRow, PricingTableProps } from "./pricing-table-base"

// Specialized pricing tables
export { PAYGPricingTable } from "./payg-pricing-table"
export { CommitmentPricingTable } from "./commitment-pricing-table"
export { InfrastructurePricingTable } from "./infrastructure-pricing-table"

// Dialogs
export { AddModelDialog } from "./add-model-dialog"

// Provider page template
export { GenAIProviderPageTemplate } from "./provider-page-template"
