import type { Metadata } from "next"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible"

export const metadata: Metadata = {
  title: "Component Demo - Accordion & Collapsible | CloudAct.ai",
  description: "Visual demonstration of accordion and collapsible components with CloudAct branding",
}

export default function ComponentDemoPage() {
  return (
    <div className="py-16 bg-white">
      <div className="container px-4 md:px-12 max-w-4xl mx-auto space-y-12">
        {/* Page Header */}
        <div className="text-center space-y-4">
          <h1 className="cloudact-heading-xl">Component Demo</h1>
          <p className="cloudact-body text-lg">
            Accordion and Collapsible components with CloudAct branding
          </p>
        </div>

        {/* Accordion - Single Collapsible Mode */}
        <section className="space-y-4">
          <div>
            <h2 className="cloudact-heading-lg mb-2">Accordion - Single Collapsible</h2>
            <p className="cloudact-body text-slate-600 mb-4">
              Only one item can be open at a time. Clicking another item closes the previous one.
            </p>
          </div>

          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="item-1">
              <AccordionTrigger>What are the key features?</AccordionTrigger>
              <AccordionContent>
                CloudAct provides comprehensive cost analytics for GenAI and cloud infrastructure.
                Track spending across OpenAI, Anthropic, Google Cloud, and more in a single dashboard.
                Get real-time alerts, detailed breakdowns, and actionable insights.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-2">
              <AccordionTrigger>How does billing work?</AccordionTrigger>
              <AccordionContent>
                We offer flexible monthly and annual plans. All plans include a 14-day free trial
                with no credit card required. You can upgrade, downgrade, or cancel at any time
                from your dashboard settings.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-3">
              <AccordionTrigger>Is my data secure?</AccordionTrigger>
              <AccordionContent>
                Yes. All credentials are encrypted using Google Cloud KMS. We never store your
                actual API keys - only encrypted versions. All data is isolated per organization
                with strict access controls and audit logging.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-4" disabled>
              <AccordionTrigger>Disabled Item (Cannot Open)</AccordionTrigger>
              <AccordionContent>
                This content is not accessible because the item is disabled.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </section>

        {/* Accordion - Multiple Open Mode */}
        <section className="space-y-4">
          <div>
            <h2 className="cloudact-heading-lg mb-2">Accordion - Multiple Open</h2>
            <p className="cloudact-body text-slate-600 mb-4">
              Multiple items can be open simultaneously.
            </p>
          </div>

          <Accordion type="multiple" className="w-full">
            <AccordionItem value="item-1">
              <AccordionTrigger>OpenAI Integration</AccordionTrigger>
              <AccordionContent>
                Connect your OpenAI account to track GPT-4, GPT-3.5, and embeddings usage.
                Monitor costs per model, analyze token consumption, and set budget alerts.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-2">
              <AccordionTrigger>Anthropic Integration</AccordionTrigger>
              <AccordionContent>
                Track Claude API usage including Claude Opus, Sonnet, and Haiku models.
                Get detailed breakdowns of prompt and completion tokens with cost analysis.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-3">
              <AccordionTrigger>Google Cloud Integration</AccordionTrigger>
              <AccordionContent>
                Connect your GCP billing account to analyze infrastructure costs.
                View spending by service, project, and region with daily granularity.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </section>

        {/* Collapsible Examples */}
        <section className="space-y-4">
          <div>
            <h2 className="cloudact-heading-lg mb-2">Collapsible Components</h2>
            <p className="cloudact-body text-slate-600 mb-4">
              Standalone collapsible sections with optional chevron icon.
            </p>
          </div>

          <div className="space-y-6">
            {/* Collapsible with Chevron */}
            <div className="border border-slate-200 rounded-lg p-4">
              <Collapsible>
                <CollapsibleTrigger>
                  Advanced Settings (with chevron)
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="space-y-2">
                    <p>Configure advanced options for your organization:</p>
                    <ul className="list-disc list-inside space-y-1 text-slate-600">
                      <li>Custom rate limiting thresholds</li>
                      <li>Webhook endpoints for alerts</li>
                      <li>Data retention policies</li>
                      <li>API access controls</li>
                    </ul>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>

            {/* Collapsible without Chevron */}
            <div className="border border-slate-200 rounded-lg p-4">
              <Collapsible>
                <CollapsibleTrigger showChevron={false}>
                  Custom Toggle (no chevron) →
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="bg-slate-50 p-4 rounded-md">
                    <p className="text-slate-700">
                      This collapsible uses a custom indicator instead of the default chevron icon.
                      You can style the trigger however you like while maintaining all the
                      accessibility and animation features.
                    </p>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>

            {/* Collapsible Disabled */}
            <div className="border border-slate-200 rounded-lg p-4">
              <Collapsible>
                <CollapsibleTrigger disabled>
                  Disabled Collapsible
                </CollapsibleTrigger>
                <CollapsibleContent>
                  This content cannot be accessed.
                </CollapsibleContent>
              </Collapsible>
            </div>
          </div>
        </section>

        {/* Design System Reference */}
        <section className="space-y-4 p-6 bg-slate-50 rounded-lg">
          <h2 className="cloudact-heading-lg mb-4">Design System Features</h2>
          <div className="grid sm:grid-cols-2 gap-6">
            <div>
              <h3 className="font-semibold text-slate-900 mb-2">Brand Colors</h3>
              <ul className="text-sm text-slate-600 space-y-1">
                <li>• Trigger Hover: Light Mint (#F0FFF4 → Mint #90FCA6)</li>
                <li>• Chevron: Gray (#64748B), rotates 180° on open</li>
                <li>• Border: Light Gray (#E2E8F0)</li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 mb-2">Accessibility</h3>
              <ul className="text-sm text-slate-600 space-y-1">
                <li>• Focus Ring: 2px Teal with offset</li>
                <li>• ARIA: aria-expanded states</li>
                <li>• Keyboard: Full navigation support</li>
                <li>• Disabled: 50% opacity, no pointer events</li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 mb-2">Animations</h3>
              <ul className="text-sm text-slate-600 space-y-1">
                <li>• Height: Smooth expand/collapse (200ms)</li>
                <li>• Chevron: 300ms ease-in-out rotation</li>
                <li>• Hover: Instant color transitions</li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 mb-2">Typography</h3>
              <ul className="text-sm text-slate-600 space-y-1">
                <li>• Trigger: Medium weight, base size</li>
                <li>• Content: Small size, comfortable padding</li>
                <li>• Colors: Slate 900/100 (dark mode)</li>
              </ul>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
