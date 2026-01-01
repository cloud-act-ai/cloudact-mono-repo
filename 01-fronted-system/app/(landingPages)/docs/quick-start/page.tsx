"use client"

import Link from "next/link"
import { useState } from "react"
import {
  Rocket,
  ArrowRight,
  CheckCircle2,
  Cloud,
  Brain,
  CreditCard,
  Shield,
  Clock,
  Terminal,
  Copy,
  Check,
} from "lucide-react"
import "../../premium.css"

// Copy button component with feedback
function CopyButton({ code, label }: { code: string; label: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement("textarea")
      textarea.value = code
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand("copy")
      document.body.removeChild(textarea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <button
      type="button"
      className="ca-docs-code-copy"
      aria-label={copied ? "Copied!" : `Copy ${label} code`}
      onClick={handleCopy}
    >
      {copied ? (
        <Check className="w-4 h-4 text-green-500" />
      ) : (
        <Copy className="w-4 h-4" />
      )}
    </button>
  )
}

const QUICK_START_STEPS = [
  {
    step: 1,
    title: "Create Your Account",
    description: "Sign up for a free 14-day trial. No credit card required.",
    icon: Shield,
    time: "1 min",
    details: [
      "Visit cloudact.ai/signup",
      "Enter your email and create a password",
      "Verify your email address",
      "Complete your organization profile",
    ],
  },
  {
    step: 2,
    title: "Connect Cloud Providers",
    description: "Link your AWS, Azure, or GCP accounts with read-only access.",
    icon: Cloud,
    time: "2 min",
    details: [
      "Go to Integrations → Cloud Providers",
      "Select your cloud provider (AWS, Azure, GCP)",
      "Follow the guided setup wizard",
      "Grant read-only billing access via IAM role or service account",
    ],
  },
  {
    step: 3,
    title: "Add GenAI Services",
    description: "Connect your OpenAI, Anthropic, or other LLM providers.",
    icon: Brain,
    time: "1 min",
    details: [
      "Go to Integrations → GenAI Providers",
      "Select your GenAI provider",
      "Enter your API key (read-only access)",
      "Usage data syncs automatically",
    ],
  },
  {
    step: 4,
    title: "Track SaaS Subscriptions",
    description: "Add your SaaS tools for complete cost visibility.",
    icon: CreditCard,
    time: "1 min",
    details: [
      "Go to Integrations → SaaS Subscriptions",
      "Add subscriptions manually or import from CSV",
      "Set renewal dates and billing cycles",
      "Assign to teams or cost centers",
    ],
  },
]

const CODE_EXAMPLES = {
  aws: `# Create IAM role for CloudAct.ai (read-only)
aws iam create-role \\
  --role-name CloudActReadOnly \\
  --assume-role-policy-document file://trust-policy.json

# Attach billing read policy
aws iam attach-role-policy \\
  --role-name CloudActReadOnly \\
  --policy-arn arn:aws:iam::aws:policy/AWSBillingReadOnlyAccess`,
  gcp: `# Grant billing viewer role
gcloud projects add-iam-policy-binding PROJECT_ID \\
  --member="serviceAccount:cloudact@PROJECT_ID.iam.gserviceaccount.com" \\
  --role="roles/billing.viewer"`,
}

export default function QuickStartPage() {
  return (
    <div className="ca-landing-page">
      {/* Hero Section */}
      <section className="ca-docs-hero">
        <div className="ca-docs-hero-content">
          <Link href="/docs" className="ca-docs-back-link">
            <ArrowRight className="w-4 h-4 rotate-180" aria-hidden="true" />
            Back to Documentation
          </Link>
          <div className="ca-section-eyebrow">
            <Rocket className="w-4 h-4" aria-hidden="true" />
            Quick Start
          </div>
          <h1 className="ca-docs-hero-title">
            Get Started in <span className="ca-hero-highlight-mint">5 Minutes</span>
          </h1>
          <p className="ca-docs-hero-subtitle">
            Follow this guide to connect your cloud providers and start optimizing costs today.
          </p>
          <div className="ca-docs-hero-meta">
            <span className="ca-docs-hero-time">
              <Clock className="w-4 h-4" aria-hidden="true" />
              5 minutes
            </span>
            <span className="ca-docs-hero-prereq">
              <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
              No prerequisites
            </span>
          </div>
        </div>
      </section>

      {/* Steps Section */}
      <section className="ca-docs-steps-section">
        <div className="ca-docs-steps-container">
          {QUICK_START_STEPS.map((step) => {
            const Icon = step.icon
            return (
              <div key={step.step} className="ca-docs-step">
                <div className="ca-docs-step-header">
                  <div className="ca-docs-step-number">
                    <span>{step.step}</span>
                  </div>
                  <div className="ca-docs-step-icon">
                    <Icon className="w-6 h-6" aria-hidden="true" />
                  </div>
                  <div className="ca-docs-step-title-group">
                    <h2 className="ca-docs-step-title">{step.title}</h2>
                    <span className="ca-docs-step-time">
                      <Clock className="w-3 h-3" aria-hidden="true" />
                      {step.time}
                    </span>
                  </div>
                </div>
                <p className="ca-docs-step-desc">{step.description}</p>
                <ul className="ca-docs-step-details">
                  {step.details.map((detail) => (
                    <li key={detail}>
                      <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                      {detail}
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      </section>

      {/* Code Examples Section */}
      <section className="ca-docs-code-section">
        <div className="ca-docs-code-container">
          <div className="ca-section-header-centered">
            <span className="ca-section-eyebrow">
              <Terminal className="w-4 h-4" aria-hidden="true" />
              Code Examples
            </span>
            <h2 className="ca-section-title">CLI Setup Commands</h2>
            <p className="ca-section-subtitle">
              Optional: Use these commands to set up access via CLI.
            </p>
          </div>

          <div className="ca-docs-code-blocks">
            <div className="ca-docs-code-block">
              <div className="ca-docs-code-header">
                <span>AWS IAM Setup</span>
                <CopyButton code={CODE_EXAMPLES.aws} label="AWS" />
              </div>
              <pre className="ca-docs-code-content">
                <code>{CODE_EXAMPLES.aws}</code>
              </pre>
            </div>

            <div className="ca-docs-code-block">
              <div className="ca-docs-code-header">
                <span>GCP IAM Setup</span>
                <CopyButton code={CODE_EXAMPLES.gcp} label="GCP" />
              </div>
              <pre className="ca-docs-code-content">
                <code>{CODE_EXAMPLES.gcp}</code>
              </pre>
            </div>
          </div>
        </div>
      </section>

      {/* Next Steps Section */}
      <section className="ca-docs-next-section">
        <div className="ca-docs-next-container">
          <h2 className="ca-docs-next-title">What's Next?</h2>
          <div className="ca-docs-next-grid">
            <Link href="/docs/api/reference" className="ca-docs-next-card">
              <Terminal className="w-6 h-6" aria-hidden="true" />
              <h3>API Reference</h3>
              <p>Explore our REST API for programmatic access.</p>
              <span className="ca-docs-next-link">
                View API Docs
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </span>
            </Link>
            <Link href="/help" className="ca-docs-next-card">
              <CheckCircle2 className="w-6 h-6" aria-hidden="true" />
              <h3>Help Center</h3>
              <p>Find answers to common questions.</p>
              <span className="ca-docs-next-link">
                Get Help
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </span>
            </Link>
            <Link href="/integrations" className="ca-docs-next-card">
              <Cloud className="w-6 h-6" aria-hidden="true" />
              <h3>Integrations</h3>
              <p>See all supported integrations.</p>
              <span className="ca-docs-next-link">
                View Integrations
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </span>
            </Link>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="ca-final-cta-section">
        <div className="ca-final-cta-container">
          <h2 className="ca-final-cta-title">Ready to Get Started?</h2>
          <p className="ca-final-cta-subtitle">
            Start your 14-day free trial and connect your first integration in minutes.
          </p>
          <div className="ca-final-cta-buttons">
            <Link href="/signup" className="ca-btn-cta-primary">
              Start Free Trial
              <ArrowRight className="w-5 h-5" aria-hidden="true" />
            </Link>
            <Link href="/demo" className="ca-btn-cta-secondary">
              Request Demo
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
