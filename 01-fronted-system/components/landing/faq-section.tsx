"use client"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"

export function FaqSection() {
  const faqs = [
    {
       question: "How does CloudAct defer from AWS Cost Explorer?",
       answer: "AWS Cost Explorer is limited to AWS. CloudAct unifies AWS, Azure, GCP, and OpenAI costs in one view. We also provide deeper granular analysis (e.g., cost per tenant, cost per API route) that CloudWatch cannot see."
    },
    {
       question: "Is there a performance impact on my apps?",
       answer: "Zero. We connect via read-only APIs to your cloud provider billing and usage endpoints. For Kubernetes, our lightweight agent uses <0.1% CPU and transmits stats asynchronously."
    },
    {
       question: "How reliable is the anomaly detection?",
       answer: "Our AI model is trained on over $500M of cloud spend patterns. We filter out false positives by learning your specific seasonality (e.g., weekday vs weekend traffic) automatically."
    },
    {
       question: "Can I self-host CloudAct?",
       answer: "Yes, we offer an Enterprise Self-Hosted version for air-gapped environments or strict compliance requirements. Contact sales for details."
    }
  ]
  
  return (
    <div className="w-full max-w-3xl mx-auto">
      <Accordion type="single" collapsible className="w-full space-y-4">
        {faqs.map((faq, i) => (
          <AccordionItem key={i} value={`item-${i}`} className="border border-slate-200 rounded-lg px-6 bg-white data-[state=open]:border-emerald-500/50 data-[state=open]:shadow-sm">
            <AccordionTrigger className="text-left text-lg font-medium text-slate-900 hover:no-underline hover:text-emerald-700 py-6">
              {faq.question}
            </AccordionTrigger>
            <AccordionContent className="text-slate-600 text-base pb-6 leading-relaxed">
              {faq.answer}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  )
}
